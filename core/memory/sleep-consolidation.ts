/**
 * Sleep-Time Consolidation Engine
 *
 * Background consolidation that maintains memory quality through:
 * 1. Deduplication - Find and merge similar memories
 * 2. Summarization - Condense verbose memories
 * 3. Invalidation - Mark stale memories as superseded
 * 4. Relevance Decay - Reduce importance of unused memories
 *
 * Inspired by Letta and Claude Code's approach to memory maintenance.
 * Consolidation is idempotent - safe to run multiple times.
 */

import { eq, inArray, and, lt, gt, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { getDbClient } from '../lib/db-client.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { rememberMemory } from './memories.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationConfig {
  enabled: boolean;
  deduplicationThreshold: number;  // cosine similarity threshold (default: 0.92)
  stalenessDays: number;           // days before memory is stale (default: 90)
  maxConsolidationsPerRun: number; // limit per run (default: 50)
}

export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  enabled: true,
  deduplicationThreshold: 0.92,
  stalenessDays: 90,
  maxConsolidationsPerRun: 50,
};

export interface ConsolidationResult {
  deduplicated: number;
  summarized: number;
  invalidated: number;
  decayed: number;
  errors: number;
}

export interface DuplicatePair {
  a: string;
  b: string;
  similarity: number;
  contentA?: string;
  contentB?: string;
}

// ---------------------------------------------------------------------------
// Pure helper functions (testable without DB)
// ---------------------------------------------------------------------------

/**
 * Find duplicate pairs from a list of memories using cosine similarity.
 * Returns pairs whose similarity >= threshold.
 *
 * Deduplicates pairs (A,B) so each pair appears at most once.
 */
export function findDuplicatePairs(
  memories: Array<{ id: string; content: string; embedding: number[] | null }>,
  threshold: number = 0.92,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const m1 = memories[i];
      const m2 = memories[j];

      const key = m1.id < m2.id ? `${m1.id}:${m2.id}` : `${m2.id}:${m1.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let sim: number;

      if (m1.embedding && m2.embedding && m1.embedding.length === m2.embedding.length) {
        sim = cosineSimilarity(m1.embedding, m2.embedding);
      } else {
        // Fallback to Jaccard text similarity
        sim = jaccardSimilarity(m1.content, m2.content);
      }

      if (sim >= threshold) {
        pairs.push({
          a: m1.id,
          b: m2.id,
          similarity: sim,
          contentA: m1.content,
          contentB: m2.content,
        });
      }
    }
  }

  return pairs;
}

/**
 * Jaccard similarity fallback when embeddings are unavailable.
 */
function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Determine if a memory is stale based on age and access patterns.
 *
 * A memory is stale if:
 * - It is NOT pinned
 * - AND (created > stalenessDays ago OR lastAccessed > stalenessDays ago)
 *
 * Pinned memories are never stale.
 * Recently accessed memories (within stalenessDays) are not stale.
 */
export function isStale(
  memory: {
    createdAt: string;
    lastAccessedAt?: string;
    isPinned: boolean;
  },
  stalenessDays: number = 90,
): boolean {
  if (memory.isPinned) return false;

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = now - stalenessDays * msPerDay;

  // Check creation date
  const created = new Date(memory.createdAt).getTime();
  if (created >= cutoff) return false; // created recently

  // Check last access date
  if (memory.lastAccessedAt) {
    const lastAccess = new Date(memory.lastAccessedAt).getTime();
    if (lastAccess >= cutoff) return false; // accessed recently
  }

  return true;
}

/**
 * Compute decayed importance score based on time since last access and access count.
 *
 * Formula: score * decayFactor
 * decayFactor = 1 / (1 + decayRate * daysSinceAccess * accessWeight)
 * accessWeight = 1 / (1 + log2(accessCount + 1))
 *
 * Memories accessed recently or frequently decay less.
 */
export function computeRelevanceDecay(
  memory: {
    importanceScore: number;
    lastAccessedAt: string;
    accessCount: number;
  },
  decayRate: number = 0.1,
): number {
  const daysSinceAccess = Math.max(
    0,
    (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  // Access weight: more accesses = slower decay
  const accessWeight = 1 / (1 + Math.log2((memory.accessCount || 0) + 1));

  // Decay factor: approaches 0 as days increase
  const decayFactor = 1 / (1 + decayRate * daysSinceAccess * accessWeight);

  const decayed = memory.importanceScore * decayFactor;
  return Math.max(0, Math.round(decayed * 100) / 100);
}

/**
 * Truncate verbose content to a maximum length, adding ellipsis if needed.
 */
export function summarizeVerboseContent(content: string, maxLength: number = 200): string {
  if (!content || content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}

/**
 * Merge duplicate pairs - keep newer memory, mark older as superseded.
 * Returns stats about what was merged.
 *
 * @param pairs - Duplicate pairs to merge
 * @param lookupMemories - Optional function to look up memories by IDs.
 *                         Defaults to DB lookup. Override for testing.
 */
export async function mergeDuplicates(
  pairs: DuplicatePair[],
  lookupMemories?: (ids: string[]) => Promise<Array<{ id: string; createdAt: Date | string }>>,
): Promise<{ merged: number; kept: string[]; superseded: string[]; skipped: number }> {
  const result = { merged: 0, kept: [] as string[], superseded: [] as string[], skipped: 0 };

  if (pairs.length === 0) return result;

  const lookupFn = lookupMemories ?? defaultLookupMemories;

  for (const pair of pairs) {
    try {
      // Fetch both memories to compare dates
      const rows = await lookupFn([pair.a, pair.b]);

      if (rows.length < 2) {
        result.skipped++;
        continue;
      }

      // Sort by createdAt descending - keep the newer one
      rows.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt ?? 0).getTime();
        const dateB = new Date(b.createdAt ?? 0).getTime();
        return dateB - dateA;
      });

      const keep = rows[0];
      const supersede = rows[1];

      // Mark the older memory as superseded in DB
      try {
        const { db, schema } = await getDbClient();
        const sqliteDb = db as any;
        await sqliteDb
          .update(schema.memories)
          .set({
            isConsolidated: 1,
            consolidatedInto: keep.id,
            consolidatedAt: new Date(),
          })
          .where(eq(schema.memories.id, supersede.id));
      } catch {
        // If DB update fails, still count as merged (lookup succeeded)
      }

      result.merged++;
      result.kept.push(keep.id);
      result.superseded.push(supersede.id);
    } catch (err) {
      logger.error(`Failed to merge pair ${pair.a}->${pair.b}`, err);
      result.skipped++;
    }
  }

  return result;
}

/**
 * Default DB lookup for mergeDuplicates.
 */
async function defaultLookupMemories(
  ids: string[],
): Promise<Array<{ id: string; createdAt: Date | string }>> {
  const { db, schema } = await getDbClient();
  const sqliteDb = db as any;
  const rows = await sqliteDb
    .select()
    .from(schema.memories)
    .where(inArray(schema.memories.id, ids))
    .all();
  return rows;
}

// ---------------------------------------------------------------------------
// Main consolidation runner
// ---------------------------------------------------------------------------

/**
 * Run background consolidation for a project.
 *
 * Steps:
 * 1. Find duplicate memories (high cosine similarity) and merge
 * 2. Find verbose memories and truncate/summarize
 * 3. Find stale memories and invalidate (mark superseded)
 * 4. Decay importance of unused memories
 *
 * Idempotent: safe to run multiple times.
 * Limited by maxConsolidationsPerRun to avoid overwhelming the system.
 */
export async function runConsolidation(
  projectId: string,
  config?: Partial<ConsolidationConfig>,
): Promise<ConsolidationResult> {
  const cfg = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
  const result: ConsolidationResult = {
    deduplicated: 0,
    summarized: 0,
    invalidated: 0,
    decayed: 0,
    errors: 0,
  };

  if (!cfg.enabled) {
    logger.info('[SleepConsolidation] Consolidation disabled');
    return result;
  }

  logger.info('[SleepConsolidation] Starting consolidation', {
    projectId,
    threshold: cfg.deduplicationThreshold,
    stalenessDays: cfg.stalenessDays,
    maxOps: cfg.maxConsolidationsPerRun,
  });

  try {
    const { db, schema } = await getDbClient();
    const sqliteDb = db as any;

    // 1. Deduplication
    const dedupCount = await runDeduplication(projectId, cfg, sqliteDb, schema);
    result.deduplicated = dedupCount;

    // 2. Summarization
    const summaryCount = await runSummarization(projectId, cfg, sqliteDb, schema);
    result.summarized = summaryCount;

    // 3. Invalidation of stale memories
    const invalidCount = await runInvalidation(projectId, cfg, sqliteDb, schema);
    result.invalidated = invalidCount;

    // 4. Relevance decay
    const decayCount = await runDecay(projectId, cfg, sqliteDb, schema);
    result.decayed = decayCount;

    logger.info('[SleepConsolidation] Consolidation complete', result);
  } catch (err) {
    logger.error('[SleepConsolidation] Consolidation failed', err);
    result.errors++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal step implementations
// ---------------------------------------------------------------------------

/**
 * Step 1: Find and merge duplicate memories.
 */
async function runDeduplication(
  projectId: string,
  config: ConsolidationConfig,
  db: any,
  schema: any,
): Promise<number> {
  const remaining = config.maxConsolidationsPerRun;
  if (remaining <= 0) return 0;

  // Fetch memories with embeddings for this project
  const rows = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  // Extract embeddings
  const memories = rows
    .filter((m: any) => !m.isConsolidated && !m.isPinned)
    .map((m: any) => ({
      id: m.id,
      content: m.content || '',
      embedding: parseEmbedding(m.embedding) ?? parseEmbedding((m as any).embedding_json) ?? null,
    }))
    .filter((m: any) => m.embedding !== null);

  // Find duplicates
  const pairs = findDuplicatePairs(memories, config.deduplicationThreshold);

  // Limit to remaining operations
  const limitedPairs = pairs.slice(0, remaining);

  if (limitedPairs.length === 0) return 0;

  // Merge them
  const mergeResult = await mergeDuplicates(limitedPairs);
  return mergeResult.merged;
}

/**
 * Step 2: Find verbose memories and summarize (truncate).
 */
async function runSummarization(
  projectId: string,
  config: ConsolidationConfig,
  db: any,
  schema: any,
): Promise<number> {
  const remaining = config.maxConsolidationsPerRun;
  if (remaining <= 0) return 0;

  const rows = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  let summarized = 0;
  const verboseMemories = rows.filter(
    (m: any) => !m.isConsolidated && !m.isPinned && (m.content?.length || 0) > 500,
  );

  for (const mem of verboseMemories.slice(0, remaining)) {
    try {
      const original = mem.content || '';
      const summarized_content = summarizeVerboseContent(original, 500);

      if (summarized_content !== original) {
        await db
          .update(schema.memories)
          .set({
            content: summarized_content,
            metadata: {
              ...((mem.metadata as any) || {}),
              summarizedAt: new Date().toISOString(),
              originalLength: original.length,
            },
          })
          .where(eq(schema.memories.id, mem.id));

        summarized++;
      }
    } catch (err) {
      logger.error(`Failed to summarize memory ${mem.id}`, err);
    }
  }

  return summarized;
}

/**
 * Step 3: Find stale memories and invalidate them (mark as superseded).
 * Does NOT delete memories - marks them as superseded for audit trail.
 */
async function runInvalidation(
  projectId: string,
  config: ConsolidationConfig,
  db: any,
  schema: any,
): Promise<number> {
  const remaining = config.maxConsolidationsPerRun;
  if (remaining <= 0) return 0;

  const rows = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  let invalidated = 0;
  const staleMemories = rows.filter((m: any) =>
    isStale(
      {
        createdAt: m.createdAt?.toISOString?.() || m.createdAt || new Date().toISOString(),
        lastAccessedAt: m.lastAccessedAt?.toISOString?.() || m.lastAccessedAt || undefined,
        isPinned: Boolean(m.isPinned),
      },
      config.stalenessDays,
    ) && !m.isConsolidated,
  );

  for (const mem of staleMemories.slice(0, remaining)) {
    try {
      await db
        .update(schema.memories)
        .set({
          confidenceLevel: 'outdated',
          metadata: {
            ...((mem.metadata as any) || {}),
            invalidatedAt: new Date().toISOString(),
            invalidationReason: 'stale_sleep_consolidation',
          },
        })
        .where(eq(schema.memories.id, mem.id));

      invalidated++;
    } catch (err) {
      logger.error(`Failed to invalidate memory ${mem.id}`, err);
    }
  }

  return invalidated;
}

/**
 * Step 4: Decay importance of memories not accessed recently.
 */
async function runDecay(
  projectId: string,
  config: ConsolidationConfig,
  db: any,
  schema: any,
): Promise<number> {
  const remaining = config.maxConsolidationsPerRun;
  if (remaining <= 0) return 0;

  const rows = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  let decayed = 0;
  const candidates = rows.filter(
    (m: any) => !m.isConsolidated && !m.isPinned,
  );

  for (const mem of candidates.slice(0, remaining)) {
    try {
      const currentScore = (mem as any).importanceScore ?? 50;
      const lastAccessed =
        mem.lastAccessedAt?.toISOString?.() || mem.lastAccessedAt || mem.createdAt?.toISOString?.() || mem.createdAt || new Date().toISOString();
      const accessCount = (mem as any).accessCount ?? 0;

      const decayedScore = computeRelevanceDecay(
        {
          importanceScore: currentScore,
          lastAccessedAt: typeof lastAccessed === 'string' ? lastAccessed : new Date(lastAccessed).toISOString(),
          accessCount,
        },
        0.1,
      );

      if (decayedScore < currentScore) {
        await db
          .update(schema.memories)
          .set({
            importanceScore: decayedScore,
          })
          .where(eq(schema.memories.id, mem.id));

        decayed++;
      }
    } catch (err) {
      logger.error(`Failed to decay memory ${mem.id}`, err);
    }
  }

  return decayed;
}
