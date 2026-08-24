/**
 * Retention lookup (Batch 6b) - the decay-to-ranking connection.
 *
 * Exposes per-memory Ebbinghaus-decayed strength so retrieval-side consumers
 * (recall-confidence freshness in search-evidence) can replace the naive
 * 2^(-ageDays/365) curve with the SAME retention model the decay engine
 * applies to relevance_score. This is read-only: nothing here mutates
 * importance or relevance columns - reinforcement owns those.
 *
 * Mirror-alignment contract (Batch 6b fix): computeRetention is the exact
 * ratio-form of decay-engine.applyTieredDecay for the same inputs:
 *   R(t) = (1 + t/tau)^(-beta),  score_after = clamp(score x tierAdjust)
 *   tau    = memories.decay_rate (days); NULL/<=0 falls back to
 *          DEFAULT_TAU_DAYS = 1d (the engine's value, shared constant)
 *   beta   = betaForMemoryType(type)
 *   t      = days since lastDecayAt (createdAt only when last_decay_at unset)
 *   tier   = sturdy/hot exempt (1.0); long-term/cold shrink effective elapsed
 *            time by their multiplier; fleeting divides the result by its
 *            multiplier (2.0 -> half strength); working/unknown neutral.
 *
 * Time normalization is hardened (same semantics as contradiction-resolver):
 * Date objects, epoch seconds and epoch millis and ISO strings all parse.
 * Unparseable timestamps NEVER silently produce full retention - they log a
 * warning and fall back to the remaining anchor; if no anchor parses at all
 * the row is treated as fully retained but the warning makes it visible.
 */

import { betaForMemoryType, DEFAULT_TAU_DAYS } from './ebbinghaus.js';
import { logger } from '../logger.js';

export interface RetentionRow {
  id: string;
  type: string | null;
  tier: string | null;
  /** Raw column value: epoch seconds, epoch ms, ISO text - or null. */
  createdAt: string | number | Date | null;
  /** Raw column value: same formats as createdAt. */
  lastDecayAt: string | number | Date | null;
  /** Days; raw integer column. */
  decayRate: number | null;
}

/**
 * Tier multipliers - MUST stay identical to decay-engine's TIER_MULTIPLIERS
 * (kept in sync by the mirror property test).
 */
const TIER_MULTIPLIERS: Record<string, number> = {
  'sturdy': 0,
  'long-term': 0.5,
  'working': 1.0,
  'fleeting': 2.0,
  // Legacy tiers (post-backfill these no longer exist, kept for safety).
  'hot': 0,
  'cold': 1.5,
};

/** Fallback tau when memories.decay_rate is NULL/unset (engine-aligned: 1 day). */
const FALLBACK_TAU_DAYS = DEFAULT_TAU_DAYS;

/**
 * Batch 6b fix: normalize a stored temporal value to epoch ms. Handles Date,
 * epoch SECONDS (<1e11), epoch milliseconds, and ISO-8601 text. Returns null
 * for anything unparseable so callers can fall back explicitly instead of
 * silently computing NaN -> falsy -> "fully retained".
 */
function toMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.getTime();
  const raw = String(value).trim();
  if (raw === '') return null;
  const num = typeof value === 'number' ? value : Number(raw);
  if (Number.isFinite(num) && /^\d+(\.\d+)?$/.test(raw)) {
    return num < 1e11 ? num * 1000 : num; // seconds -> ms
  }
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure Ebbinghaus retention for one row given a fixed "now" (ms).
 * Deterministic and unit-testable; no DB access.
 */
export function computeRetention(row: RetentionRow, nowMs: number): number {
  // Exempt tiers never decay by design (engine skips them outright).
  if ((TIER_MULTIPLIERS[row.tier ?? ''] ?? 1) === 0) return 1;

  const baseBeta = betaForMemoryType(row.type);
  const multiplier = TIER_MULTIPLIERS[row.tier ?? ''] ?? 1.0;

  // Anchor exactly like the engine: lastDecayAt when parseable, else createdAt.
  const lastDecayMs = toMs(row.lastDecayAt);
  let anchorMs = lastDecayMs;
  if (anchorMs === null) {
    anchorMs = toMs(row.createdAt);
    if (anchorMs === null) {
      // No usable temporal anchor at all: never a SILENT 1.0.
      logger.warn(
        `[retention] no parseable temporal anchor for memory ${row.id ?? '(unknown)'} ` +
        `(created_at=${JSON.stringify(row.createdAt)}, last_decay_at=${JSON.stringify(row.lastDecayAt)}); treating as fully retained`
      );
      return 1;
    }
  }

  const ageDays = Math.max(0, (nowMs - anchorMs) / 86_400_000);
  const tau = row.decayRate && row.decayRate > 0 ? row.decayRate : FALLBACK_TAU_DAYS;

  // Base Ebbinghaus curve; long-term-style tiers shrink effective elapsed time.
  const effectiveAgeDays = multiplier > 0 && multiplier < 1 ? ageDays * multiplier : ageDays;
  let retention = Math.pow(1 + effectiveAgeDays / tau, -baseBeta);

  // Fleeting-style tiers accelerate decay by dividing the resulting strength
  // (the engine divides the decayed SCORE by the multiplier - same ratio).
  if (multiplier > 1) retention = retention / multiplier;

  return Math.max(0, Math.min(1, retention));
}

/**
 * Batch retention lookup over final search-result ids. One prepared SELECT,
 * retention computed locally - cheap enough to run inside every search's
 * evidence pass. Never throws: on any failure callers fall back to the
 * age-only curve.
 */
export async function getRetentionMap(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids || ids.length === 0) return map;

  try {
    const { getDb } = await import('../../db/index.js');
    const db = await getDb();
    if (!db) return map;
    const sqlite = (db as any)?.$client ?? db;
    if (!sqlite || typeof sqlite.prepare !== 'function') return map;

    const stmt = sqlite.prepare(
      `SELECT id, type, tier, created_at AS createdAt, last_decay_at AS lastDecayAt, decay_rate AS decayRate
       FROM memories WHERE id IN (${ids.map(() => '?').join(',')})`
    );
    const rows = stmt.all(...ids) as Array<RetentionRow>;

    const nowMs = Date.now();
    for (const row of rows) {
      map.set(row.id, computeRetention(row, nowMs));
    }
    return map;
  } catch (error) {
    logger.debug(`[retention] getRetentionMap failed: ${error instanceof Error ? error.message : error}`);
    return map;
  }
}

/**
 * Single-memory convenience wrapper around getRetentionMap.
 */
export async function getRetention(memoryId: string): Promise<number | null> {
  const map = await getRetentionMap([memoryId]);
  return map.get(memoryId) ?? null;
}
