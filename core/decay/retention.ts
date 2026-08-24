/**
 * Retention lookup (Batch 6b) - the decay-to-ranking connection.
 *
 * Exposes per-memory Ebbinghaus-decayed strength so retrieval-side consumers
 * (recall-confidence freshness in search-evidence) can replace the naive
 * 2^(-ageDays/365) curve with the SAME retention model the decay engine
 * applies to relevance_score. This is read-only: nothing here mutates
 * importance or relevance columns - reinforcement owns those.
 *
 * Retention semantics mirror decay-engine.applyEbbinghausDecay:
 *   R(t) = (1 + t/tau)^(-beta)
 *   tau  = memories.decay_rate (days; fallback 30)
 *   beta = betaForMemoryType(type) x tierMultiplier(tier)
 *   t    = days since max(lastDecayAt, createdAt)
 * Tier adjustments mirror the engine's multipliers: sturdy/hot rows are
 * exempt (retention 1), long-term halves beta, fleeting doubles it.
 */

import { betaForMemoryType } from './ebbinghaus.js';

export interface RetentionRow {
  id: string;
  type: string | null;
  tier: string | null;
  /** Epoch seconds (raw column). */
  createdAt: number | null;
  /** Epoch seconds (raw column). */
  lastDecayAt: number | null;
  /** Days; raw integer column. */
  decayRate: number | null;
}

/** Tier-based beta multipliers - mirrors decay-engine's tierMultipliers. */
const TIER_BETA_MULTIPLIERS: Record<string, number> = {
  'sturdy': 0,
  'long-term': 0.5,
  'working': 1.0,
  'fleeting': 2.0,
  // Legacy tiers (post-backfill these no longer exist, kept for safety).
  'hot': 0,
  'cold': 1.5,
};

/** Fallback tau when memories.decay_rate is unset/zero (matches schema default 30d). */
const DEFAULT_TAU_DAYS = 30;

/**
 * Pure Ebbinghaus retention for one row given a fixed "now" (ms).
 * Deterministic and unit-testable; no DB access.
 */
export function computeRetention(row: RetentionRow, nowMs: number): number {
  // Sturdy rows never decay by design.
  if ((TIER_BETA_MULTIPLIERS[row.tier ?? ''] ?? 1) === 0) return 1;

  const baseBeta = betaForMemoryType(row.type);
  const multiplier = TIER_BETA_MULTIPLIERS[row.tier ?? ''] ?? 1.0;
  const beta = baseBeta * multiplier;

  const anchorSec = Math.max(row.lastDecayAt ?? 0, row.createdAt ?? 0);
  if (!anchorSec) return 1; // no temporal anchor: treat as fully retained
  const ageDays = Math.max(0, (nowMs - anchorSec * 1000) / 86_400_000);

  const tau = row.decayRate && row.decayRate > 0 ? row.decayRate : DEFAULT_TAU_DAYS;

  const retention = Math.pow(1 + ageDays / tau, -beta);
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
    const rows = stmt.all(...ids) as Array<{
      id: string;
      type: string | null;
      tier: string | null;
      createdAt: number | null;
      lastDecayAt: number | null;
      decayRate: number | null;
    }>;

    const nowMs = Date.now();
    for (const row of rows) {
      map.set(row.id, computeRetention(row, nowMs));
    }
    return map;
  } catch {
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
