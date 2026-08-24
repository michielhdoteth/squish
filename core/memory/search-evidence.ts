/**
 * Search evidence collection (Batch 6a).
 *
 * Gathers the itemized evidence vectors that feed recall-confidence for a
 * finalized candidate set. Read-only: two cheap queries over the FINAL result
 * ids (memory rows + association counts). Runs after ranking is complete, so
 * nothing here can influence ordering - confidence is additive metadata.
 *
 * Honest-by-default: signals the pipeline did not observe are null, never 0.
 */

import type { SearchResult } from './memories.js';
import { isLikelyStale } from '../retrieval/temporal-validity.js';
import {
  computeRecallConfidence,
  retentionFromAge,
  assessRecall,
  type RecallEvidence,
  type RecallAssessment,
  type ConfidenceTier,
} from '../scoring/recall-confidence.js';
// Batch 6b: per-memory Ebbinghaus retention replaces the naive age-only curve.
import { computeRetention, type RetentionRow } from '../decay/retention.js';

/** Association types that indicate competing versions of a fact. */
const CONFLICT_ASSOCIATION_TYPES = ['supersedes', 'contradicts', 'updates', 'merged', 'duplicate'] as const;

/**
 * Freshness kill switch, used by the golden eval's freshness ablation
 * (SQUISH_EVIDENCE_FRESHNESS=false): when off, the freshness evidence signal
 * is reported as null for every result - the honest "signal not observed"
 * state - instead of silently degrading to a constant.
 */
export function isFreshnessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SQUISH_EVIDENCE_FRESHNESS;
  if (raw === undefined || raw === '') return true;
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

interface MemoryMetaRow {
  id: string;
  confidenceLevel: string | null;
  status: string | null;
}

/** Decay columns fetched alongside meta for the Batch 6b retention factor. */
interface MemoryDecayRow {
  id: string;
  type: string | null;
  tier: string | null;
  createdAt: number | null;
  lastDecayAt: number | null;
  decayRate: number | null;
}

interface AssociationEdgeRow {
  fromMemoryId: string;
  toMemoryId: string;
  associationType: string;
}

export interface EvidenceCollectionContext {
  /** Semantic scores of all candidates in the set (for the margin factor). */
  candidateSemanticScores: Array<number | null>;
  /** True when the FTS5 leg returned any rows for this query. */
  multiSignalQuery: boolean;
  /** Lexical leg's own ranking: memoryId -> { rank, score } (score normalized within-leg). */
  lexicalRanks?: Map<string, { rank: number; score: number }>;
  /** Pre-rerank top-5 order vs post-rerank top-5 order (agreement fraction). */
  rerankAgreement?: number | null;
}

/**
 * Build one result's evidence vector from pipeline observations + DB meta.
 * Pure given its inputs; DB reads happen once per search in collectDbMeta().
 */
export function buildEvidence(
  result: SearchResult,
  dbMeta: { confidenceLevel: string | null; status: string | null } | undefined,
  conflictEdges: { contradictingCount: number; supportingCount: number; supersededBy: string | null },
  ctx: EvidenceCollectionContext,
  nowMs: number,
  /**
   * Batch 6b: Ebbinghaus-decayed retention for this memory (0..1), from the
   * same model the decay engine applies. null/undefined falls back to the
   * naive age-only curve (belief-corpus rows and legacy paths).
   */
  retention?: number | null
): RecallEvidence {
  const breakdown = (result.scoreBreakdown ?? {}) as Record<string, number | undefined>;

  // Conflict-flavored penalties actually applied during ranking.
  const conflictComponents = ['supersededPenalty', 'stalenessPenalty']
    .map(k => breakdown[k])
    .filter((v): v is number => typeof v === 'number' && v !== 0);
  const conflictPenalty = conflictComponents.length > 0
    ? conflictComponents.reduce((a, b) => a + b, 0)
    : null;

  // Graph contribution: only when the boost leg actually moved this result.
  const graphComponent = breakdown.graph;
  const graph = typeof graphComponent === 'number' && graphComponent > 0 ? graphComponent : null;

  // Freshness from the per-memory Ebbinghaus retention curve (Batch 6b) when
  // the decay columns are available; falls back to the naive age-only curve
  // for rows without a memories-table anchor (belief-corpus results).
  let freshness: number | null = null;
  if (isFreshnessEnabled()) {
    if (typeof retention === 'number' && Number.isFinite(retention)) {
      freshness = Math.max(0, Math.min(1, retention));
    } else if (result.createdAt) {
      const t = new Date(result.createdAt).getTime();
      if (Number.isFinite(t)) {
        freshness = retentionFromAge((nowMs - t) / 86_400_000);
      }
    }
  }

  // Rule-based staleness heuristic (same detector the temporal-validity leg
  // uses when enabled). Evidence-only: computing it here never re-ranks.
  let stale: boolean | null = null;
  if (result.createdAt) {
    try {
      stale = isLikelyStale({
        content: result.content ?? '',
        createdAt: result.createdAt,
        lastAccessedAt: (result as any).lastAccessedAt as string | undefined,
      });
    } catch {
      stale = null;
    }
  }

  const lex = ctx.lexicalRanks?.get(result.id) ?? null;

  return {
    semantic: typeof result.semanticScore === 'number' ? result.semanticScore : null,
    lexical: {
      rank: lex ? lex.rank : null,
      score: lex && Number.isFinite(lex.score) ? lex.score : null,
    },
    graph,
    temporal: {
      stale,
      supersededBy: conflictEdges.supersededBy,
    },
    conflictPenalty,
    memoryConfidence:
      dbMeta?.confidenceLevel === 'certain' || dbMeta?.confidenceLevel === 'speculative' || dbMeta?.confidenceLevel === 'outdated'
        ? dbMeta.confidenceLevel
        : null,
    supportingCount: conflictEdges.supportingCount,
    contradictingCount: conflictEdges.contradictingCount,
    freshness,
    rerankAgreement: ctx.rerankAgreement ?? null,
  };
}

/**
 * Read DB metadata + association counts + decay columns for the final result
 * ids in batched queries. Never throws - evidence collection must not break
 * search; on failure callers proceed without meta (signals stay null).
 */
export async function collectDbMeta(
  ids: string[],
): Promise<{
  metaById: Map<string, { confidenceLevel: string | null; status: string | null }>;
  conflictsById: Map<string, { contradictingCount: number; supportingCount: number; supersededBy: string | null }>;
  /** Batch 6b: per-id Ebbinghaus retention (0..1) from the decay engine's model. */
  retentionById: Map<string, number>;
}> {
  const empty = {
    metaById: new Map<string, { confidenceLevel: string | null; status: string | null }>(),
    conflictsById: new Map<string, { contradictingCount: number; supportingCount: number; supersededBy: string | null }>(),
    retentionById: new Map<string, number>(),
  };
  if (ids.length === 0) return empty;

  try {
    const { getDb } = await import('../../db/index.js');
    const { getSchema } = await import('../../db/schema.js');
    const db = await getDb();
    const schema = await getSchema();
    if (!db || !(schema as any)?.memories) return empty;
    const sqliteDb = (db as any)?.$client ?? db;

    // Raw parameterized SQL keeps this identical across SQLite/Postgres drivers.
    const placeholders = ids.map(() => '?').join(',');
    let metaMap = new Map<string, { confidenceLevel: string | null; status: string | null }>();
    const decayRows: MemoryDecayRow[] = [];
    if (sqliteDb && typeof sqliteDb.prepare === 'function') {
      // Batch 6b: one query now also carries the decay columns feeding the
      // Ebbinghaus retention factor (replaces the naive age-only curve).
      const stmt = sqliteDb.prepare(
        `SELECT id, confidence_level AS confidenceLevel, status,
                type, tier, created_at AS createdAt, last_decay_at AS lastDecayAt, decay_rate AS decayRate
         FROM memories WHERE id IN (${placeholders})`
      );
      const rows = stmt.all(...ids) as Array<MemoryMetaRow & MemoryDecayRow>;
      for (const r of rows) {
        metaMap.set(r.id, { confidenceLevel: r.confidenceLevel ?? null, status: r.status ?? null });
        decayRows.push(r);
      }
    }

    // Batch 6b: belief-corpus results (knowledge table) - fetch their meta so
    // the evidence block works for both corpora. Only valid confidence-level
    // enums are surfaced; everything else stays null (honest absence).
    const missingIds = ids.filter(id => !metaMap.has(id));
    if (missingIds.length > 0 && sqliteDb && typeof sqliteDb.prepare === 'function') {
      try {
        const kPlaceholders = missingIds.map(() => '?').join(',');
        const kStmt = sqliteDb.prepare(
          `SELECT id, confidence_level AS confidenceLevel, status FROM knowledge WHERE id IN (${kPlaceholders})`
        );
        const kRows = kStmt.all(...missingIds) as Array<MemoryMetaRow>;
        for (const r of kRows) {
          metaMap.set(r.id, { confidenceLevel: r.confidenceLevel ?? null, status: r.status ?? null });
        }
      } catch {
        // knowledge table unavailable: belief rows keep null signals
      }
    }

    // Batch 6b: retention computed locally from fetched columns (pure math).
    const nowMs = Date.now();
    const retentionById = new Map<string, number>();
    for (const row of decayRows) {
      retentionById.set(
        row.id,
        computeRetention(row as unknown as RetentionRow, nowMs)
      );
    }

    // Association edges touching any final id (both directions), capped scan.
    // Batch 6b fix: this must go through the DRIZZLE wrapper (`db`), not the
    // raw $client - .select() is a drizzle builder method. Using the raw
    // client made collectDbMeta throw on every call, silently disabling all
    // DB-derived evidence signals (confidence level, conflicts, support).
    const conflictsById = new Map<string, { contradictingCount: number; supportingCount: number; supersededBy: string | null }>();
    const assocSchema = (schema as any).memoryAssociations;
    if (assocSchema && typeof (db as any)?.select === 'function') {
      const edgeRows = (await (db as any)
        .select({
          fromMemoryId: assocSchema.fromMemoryId,
          toMemoryId: assocSchema.toMemoryId,
          associationType: assocSchema.associationType,
        })
        .from(assocSchema)
        .limit(5000)) as Array<AssociationEdgeRow>;

      const idSet = new Set(ids);
      const ensure = (id: string) => {
        let e = conflictsById.get(id);
        if (!e) {
          e = { contradictingCount: 0, supportingCount: 0, supersededBy: null };
          conflictsById.set(id, e);
        }
        return e;
      };

      for (const e of edgeRows) {
        const touchesFrom = idSet.has(e.fromMemoryId);
        const touchesTo = idSet.has(e.toMemoryId);
        if (!touchesFrom && !touchesTo) continue;
        const isConflictType = (CONFLICT_ASSOCIATION_TYPES as readonly string[]).includes(e.associationType);

        if (touchesFrom) {
          const entry = ensure(e.fromMemoryId);
          // Edge FROM a newer memory TO this one means: something supersedes/updates THIS memory.
          if (isConflictType && touchesTo && (e.associationType === 'supersedes' || e.associationType === 'updates')) {
            entry.contradictingCount += 1;
            entry.supersededBy ??= e.fromMemoryId;
          } else if (isConflictType) {
            entry.contradictingCount += 1;
          } else {
            entry.supportingCount += 1;
          }
        }
        if (touchesTo) {
          const entry = ensure(e.toMemoryId);
          if (isConflictType) entry.contradictingCount += 1;
          else entry.supportingCount += 1;
        }
      }
    }

    return { metaById: metaMap, conflictsById, retentionById };
  } catch (e) {
    if (process.env.SQUISH_EVIDENCE_DEBUG === 'true') {
      console.error('[search-evidence] collectDbMeta failed:', e);
    }
    return empty;
  }
}

/**
 * Attach evidence + calibrated recall confidence to finalized search results.
 * Additive metadata ONLY: ordering, scores, and array contents are untouched.
 * Returns the best-result summary plus the abstention-aware assessment for
 * trace attachment.
 */
export async function attachRecallConfidence(
  results: SearchResult[],
  ctx: EvidenceCollectionContext
): Promise<{ bestConfidence: number; bestTier: ConfidenceTier; assessment: RecallAssessment }> {
  if (!results || results.length === 0) {
    return { bestConfidence: 0, bestTier: 'LOW', assessment: assessRecall([]) };
  }

  const nowMs = Date.now();
  const ids = results.map(r => r.id);
  const { metaById, conflictsById, retentionById } = await collectDbMeta(ids);

  let bestConfidence = 0;
  let bestTier: ConfidenceTier = 'LOW';

  for (const r of results) {
    const meta = metaById.get(r.id);
    const conflicts = conflictsById.get(r.id) ?? { contradictingCount: 0, supportingCount: 0, supersededBy: null };
    // Batch 6b: decayed strength feeds the freshness factor when available.
    const retention = retentionById.get(r.id) ?? null;
    const evidence = buildEvidence(r, meta, conflicts, ctx, nowMs, retention);
    const scored = computeRecallConfidence(evidence, {
      candidateSemanticScores: ctx.candidateSemanticScores,
      multiSignalQuery: ctx.multiSignalQuery,
    });

    (r as any).evidence = evidence;
    (r as any).recallConfidence = scored.confidence;
    (r as any).confidenceTier = scored.tier;

    if (scored.confidence > bestConfidence) {
      bestConfidence = scored.confidence;
      bestTier = scored.tier;
    }
  }

  const assessment = assessRecall(results.map(r => ({ recallConfidence: (r as any).recallConfidence as number })));
  return { bestConfidence, bestTier, assessment };
}
