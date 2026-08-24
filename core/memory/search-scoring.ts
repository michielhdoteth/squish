/**
 * Search Scoring Helpers - All scoring/ranking/filtering for hybrid search
 *
 * Includes: RRF fusion, place-aware scoring, tag overlap boost,
 * supersession filtering, session/temporal boosting, graph boost,
 * association expansion, and heuristic scoring.
 */

import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { requireProject } from '../../core/projects.js';
import { logger } from '../logger.js';
import { getRetrievalConfig, type SquishRetrievalConfig, type RetrievalScoringConfig } from '../retrieval/config.js';
import { questionPlaceType } from '../places/question-router.js';
import { getAdjacentPlaces as getQuestionAdjacentPlaces } from '../places/rules.js';
import { getSchema } from '../../db/schema.js';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { getRelatedMemories } from '../associations.js';
import type { SearchDbContext } from './vector-search.js';

/**
 * Score with recency + similarity + entity boost (NO LLM required)
 */
export function scoreWithHeuristics(
  result: SearchResult,
  query: string,
  now: number
): number {
  let score = result.similarity ?? 0;

  // 1. Recency boost: Recent = higher (up to +0.1)
  if (result.createdAt) {
    const created = new Date(result.createdAt).getTime();
    if (Number.isFinite(created)) {
      const ageHours = (now - created) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 0.1 * Math.exp(-ageHours / 720)); // Decay over 30 days
      score += recencyScore;
    }
  }

  // 2. Entity overlap: Query words appearing in content = boost
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const contentWords = new Set((result.content ?? "").toLowerCase().split(/\s+/));
  const overlap = [...queryWords].filter(w => contentWords.has(w)).length;
  score += overlap * 0.02; // Small boost per matching word

  return score;
}

/**
 * Query memory_places indexed table by placeType with weight threshold
 */
export async function getMemoryPlacesByType(
  placeType: string,
  minWeight: number,
  limit: number,
  ctx?: SearchDbContext
): Promise<Array<{ memoryId: string; weight: number; isPrimary: boolean }>> {
  const db = ctx?.db ?? await getDb();
  if (!db) return [];
  const schema = await getSchema();
  const sqliteDb = db as any;

  try {
    const results = await sqliteDb.select({
      memoryId: schema.memoryPlaces.memoryId,
      weight: schema.memoryPlaces.weight,
      isPrimary: schema.memoryPlaces.isPrimary,
    })
      .from(schema.memoryPlaces)
      .where(and(
        eq(schema.memoryPlaces.placeType, placeType),
        gte(schema.memoryPlaces.weight, minWeight)
      ))
      .orderBy(schema.memoryPlaces.weight)
      .limit(limit);

    return results;
  } catch (e) {
    logger.debug(`[HybridSearch] getMemoryPlacesByType failed: ${e}`);
    return [];
  }
}

/**
 * Query memory_tags indexed table for tag overlap
 */
export async function getMemoriesByIndexedTags(
  tags: string[],
  limit: number,
  ctx?: SearchDbContext
): Promise<Array<{ memoryId: string; tag: string }>> {
  if (tags.length === 0) return [];
  const db = ctx?.db ?? await getDb();
  if (!db) return [];
  const schema = await getSchema();
  const sqliteDb = db as any;

  try {
    const memTags = (schema as any).memoryTags;
    const results = await sqliteDb.select({
      memoryId: memTags.memoryId,
      tag: memTags.tag,
    })
      .from(memTags)
      .where(inArray(memTags.tag, tags))
      .limit(limit * tags.length);

    return results;
  } catch (e) {
    logger.debug(`[HybridSearch] getMemoriesByIndexedTags failed: ${e}`);
    return [];
  }
}

/**
 * Get IDs of superseded memories to filter from results
 */
export async function getSupersededMemoryIds(projectId?: string, ctx?: SearchDbContext): Promise<Set<string>> {
  const db = ctx?.db ?? await getDb();
  if (!db) return new Set();
  const schema = await getSchema();
  const sqliteDb = db as any;

  try {
    const conditions: any[] = [inArray(schema.memories.status, ['superseded', 'merged'])];
    if (projectId) {
      conditions.push(eq(schema.memories.projectId, projectId));
    }

    const results = await sqliteDb.select({ id: schema.memories.id })
      .from(schema.memories)
      .where(and(...conditions))
      .limit(1000);

    return new Set(results.map((r: any) => r.id));
  } catch (e) {
    logger.debug(`[HybridSearch] getSupersededMemoryIds failed: ${e}`);
    return new Set();
  }
}

/**
 * Apply place-aware scoring using indexed memory_places queries.
 * Replaces the old applyPlaceFilterAndBoost for v1.5.0.
 */
export async function applyMultiPlaceScoring(
  results: SearchResult[],
  input: SearchInput,
  limit: number,
  retrievalConfig: SquishRetrievalConfig,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  if (!input.project) return results;

  try {
    const project = await requireProject(input.project);

    // Determine query place from question routing or explicit placeType
    const queryPlace = input.placeType || questionPlaceType(input.query || '');

    // Get memory IDs for the primary place via indexed query
    const primaryMatches = await getMemoryPlacesByType(
      queryPlace,
      retrievalConfig.placeMinWeight,
      limit * 3,
      ctx
    );
    const primaryIds = new Set(primaryMatches.map(m => m.memoryId));
    const primaryWeightMap = new Map(primaryMatches.map(m => [m.memoryId, m.weight]));

    // Get adjacent places for fallback
    const adjacentPlaces = getQuestionAdjacentPlaces(queryPlace as any);
    const adjacentMatchesArrays = await Promise.all(
      adjacentPlaces.map(p => getMemoryPlacesByType(p, retrievalConfig.placeMinWeight, limit * 2, ctx))
    );
    const adjacentIds = new Set(adjacentMatchesArrays.flat().map(m => m.memoryId));

    // Apply place boost to results
    const boosted = results.map(r => {
      const isPrimary = primaryIds.has(r.id);
      const isAdjacent = adjacentIds.has(r.id);
      const primaryWeight = primaryWeightMap.get(r.id) ?? 0;

      let placeBoost = 0;
      if (isPrimary) {
        placeBoost = retrievalConfig.scoring.placeBoost * Math.min(primaryWeight, 1.0);
      } else if (isAdjacent) {
        placeBoost = retrievalConfig.scoring.placeBoost * 0.5;
      }

      return {
        ...r,
        similarity: (r.similarity ?? 0) + placeBoost,
      };
    });

    boosted.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return boosted.slice(0, limit * 2);
  } catch (e) {
    logger.debug(`[HybridSearch] applyMultiPlaceScoring failed: ${e}`);
    return results;
  }
}

/**
 * Apply tag overlap boost using indexed memory_tags queries
 */
export async function applyTagOverlapBoost(
  results: SearchResult[],
  queryTags: string[],
  scoring: RetrievalScoringConfig,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  if (!queryTags || queryTags.length === 0) return results;

  // Normalize query tags for matching
  const normalizedQueryTags = queryTags.map(t => t.toLowerCase().trim().replace(/\s+/g, '-'));

  const tagMatches = await getMemoriesByIndexedTags(normalizedQueryTags, results.length * 5, ctx);

  // Count overlapping tags per memory
  const overlapCounts = new Map<string, number>();
  for (const m of tagMatches) {
    overlapCounts.set(m.memoryId, (overlapCounts.get(m.memoryId) ?? 0) + 1);
  }

  return results.map(r => ({
    ...r,
    similarity: (r.similarity ?? 0) +
      Math.min((overlapCounts.get(r.id) ?? 0) * scoring.tagOverlapBoost, 0.30),
  }));
}

/**
 * Filter or penalize superseded memories from results
 * When includeSuperseded=false: filter them out entirely
 * When includeSuperseded=true: include them but apply supersededPenalty
 */
export async function applySupersessionFilter(
  results: SearchResult[],
  projectId: string | undefined,
  includeSuperseded: boolean,
  retrievalConfig: SquishRetrievalConfig,
  ctx?: SearchDbContext
): Promise<{ filtered: SearchResult[]; supersededCount: number }> {
  const supersededIds = await getSupersededMemoryIds(projectId, ctx);
  if (supersededIds.size === 0) return { filtered: results, supersededCount: 0 };

  let supersededCount = 0;

  if (includeSuperseded) {
    // When including superseded: apply supersededPenalty from scoring config
    const filtered = results.map(r => {
      if (supersededIds.has(r.id)) {
        supersededCount++;
        return {
          ...r,
          similarity: Math.max(0, (r.similarity ?? 0) - retrievalConfig.scoring.supersededPenalty),
        };
      }
      return r;
    });

    // Re-sort after penalty
    filtered.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    if (supersededCount > 0) {
      logger.debug(`[HybridSearch] Applied supersededPenalty to ${supersededCount} memories (includeSuperseded=true)`);
    }

    return { filtered, supersededCount };
  }

  // Default: filter out superseded memories entirely
  const filtered = results.filter(r => {
    if (supersededIds.has(r.id)) {
      supersededCount++;
      return false;
    }
    return true;
  });

  if (supersededCount > 0) {
    logger.debug(`[HybridSearch] Filtered ${supersededCount} superseded memories`);
  }

  return { filtered, supersededCount };
}

/**
 * Task 3: Boost memories from the same session (temporal)
 */
export function applySessionBoost(
  results: SearchResult[],
  sessionId: string
): SearchResult[] {
  const SESSION_BOOST = 0.1;

  const boosted = results.map(r => {
    // Check if memory's session matches query's session
    const memSession = (r.metadata as any)?.sessionMetadata?.sessionId as string | undefined;
    if (memSession === sessionId) {
      return {
        ...r,
        similarity: (r.similarity ?? 0) + SESSION_BOOST
      };
    }
    return r;
  });

  // Re-sort with session boost
  boosted.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  return boosted;
}

/**
 * TEMPORAL FIX: Boost memories that contain date references for "when" questions
 * Also boost by date RECENCY - closer to today = higher for temporal queries
 */
export function applyTemporalBoost(results: SearchResult[]): SearchResult[] {
  const TEMPORAL_BOOST = 0.25; // Moderate boost for date-containing memories

  const boosted = results.map(r => {
    let boost = 0;

    // Boost 1: Has date reference - high priority for temporal
    if (hasDateReference(r.content ?? "")) {
      boost += TEMPORAL_BOOST;
    }

    return {
      ...r,
      similarity: (r.similarity ?? 0) + boost
    };
  });

  // Re-sort with temporal boost
  boosted.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  return boosted;
}

/**
 * Check if content contains date/time references
 */
function hasDateReference(content: string): boolean {
  const datePatterns = [
    /\b\d{4}\b/,                    // Years: 2023, 2022
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i, // Month dates
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Dates: 5/7/2023
    /\b(yesterday|today|tomorrow|last week|last month|last year)\b/i,
    /\b(\d+)\s+(day|week|month|year)s?\s+(ago|before)\b/i,
  ];
  const lower = content.toLowerCase();
  return datePatterns.some(p => p.test(content) || p.test(lower));
}

/**
 * Dead-status predicate shared by candidate expansion paths (Batch 2).
 * Mirrors the SQL-leg filter: only expired/archived hard-exclude here;
 * superseded/merged remain a scoring-layer concern.
 */
function isDeadCandidateStatus(status: unknown): boolean {
  return status === 'expired' || status === 'archived';
}

/**
 * Consolidated-source predicate (isConsolidated stored as boolean or int).
 */
function isConsolidatedSourceRow(value: unknown): boolean {
  return value === true || value === 1;
}

/**
 * Expand results with directly associated memories.
 * Related memories that are expired/archived (or consolidated sources,
 * unless opts.includeConsolidatedSources) are not pulled in - association
 * expansion must not resurrect rows the SQL legs already exclude.
 */
export async function expandWithAssociations(
  results: SearchResult[],
  limit: number,
  opts?: { includeConsolidatedSources?: boolean }
): Promise<SearchResult[]> {
  const allIds = new Set(results.map(r => r.id));
  const expanded: SearchResult[] = [...results];

  // Parallel: fetch related memories for all top results at once
  const topResults = results.slice(0, 3);
  const relatedArrays = await Promise.all(
    topResults.map(async (r) => {
      try {
        return await getRelatedMemories(r.id, 5);
      } catch {
        return [];
      }
    })
  );

  for (const related of relatedArrays) {
    for (const rel of related) {
      if (!allIds.has(rel.id)) {
        if (isDeadCandidateStatus(rel?.status)) continue;
        if (!opts?.includeConsolidatedSources && isConsolidatedSourceRow(rel?.isConsolidated)) continue;
        allIds.add(rel.id);
        expanded.push({
          ...rel,
          similarity: (rel.similarity ?? 0) * 0.8 // Slightly lower weight
        });
      }
    }
  }

  // Re-sort and return top results
  expanded.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return expanded.slice(0, limit);
}

/**
 * Apply small graph boost to results
 * Graph boost is ADDITIVE (not dominating)
 */
export function applyGraphBoostWithWeight(
  results: SearchResult[],
  graphBoostMap: Record<string, number>,
  limit: number,
  graphWeight: number
): SearchResult[] {
  // Apply SMALL additive boost to each result
  // graphWeight should be 0.1-0.3, not > 1
  const boosted = results.map(result => {
    const boost = graphBoostMap[result.id] ?? 0;
    // Add small nudge, don't replace similarity
    const boostedSimilarity = (result.similarity ?? 0) + (boost * graphWeight);
    return { ...result, similarity: boostedSimilarity };
  });

  // Re-sort by boosted similarity
  boosted.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  return boosted.slice(0, limit);
}
