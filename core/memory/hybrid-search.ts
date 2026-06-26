/**
 * Vector Search - Pure semantic search with optional graph boosting + multi-session support
 *
 * Uses cosine similarity on embeddings + optional graph boost
 * BM25 removed - use qmd-client for BM25 + vectors + reranking
 */

import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../storage/database.js';
import { getEmbedding } from '../../core/embeddings.js';
import { requireProject } from '../../core/projects.js';
import { deserializeTags, deserializeMetadata, normalizeTags } from './serialization.js';
import { computeGraphBoost } from '../search/graph-boost.js';
import { normalizeTimestamp } from '../lib/utils.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import config from '../../config.js';
import { getRelatedMemories } from '../associations.js';
import { multiHopSearch } from '../graph/multi-hop-retrieval.js';
import { callLLM } from '../llm/client.js';
import { logger } from '../logger.js';
import { getRetrievalConfig, type SquishRetrievalConfig, type RetrievalScoringConfig, type RetrievalTrace, type ScoreBreakdown } from '../retrieval/config.js';
import { questionPlaceType } from '../places/question-router.js';
import { getAdjacentPlaces as getQuestionAdjacentPlaces } from '../places/rules.js';
import { getSchema } from '../../db/schema.js';
import { eq, and, gte, inArray } from 'drizzle-orm';
import type { VisibilityScope } from '../team/types.js';

// Enhanced retrieval modules
import { rerankResults } from '../retrieval/cross-encoder-reranker.js';
import { enrichContent } from '../retrieval/contextual-enrichment.js';
import { smartMMR } from '../retrieval/mmr-diversity.js';

// Advanced retrieval modules
import { expandQuery } from '../retrieval/query-expansion.js';
import { extractQueryEntities, entityBoost } from '../retrieval/entity-aware-retrieval.js';
import { detectTemporalReferences, isLikelyStale } from '../retrieval/temporal-validity.js';

/**
 * Detect if query asks about time (temporal queries)
 */
function isTemporalQuery(query: string): boolean {
  const temporalIndicators = [
    'when', 'how long', 'how many', 'ago', 'since', 'until',
    'before', 'after', 'earlier', 'later', 'yesterday', 'tomorrow',
    'last week', 'next week', 'last month', 'next month'
  ];
  const lower = query.toLowerCase();
  return temporalIndicators.some(w => lower.includes(w));
}

/**
 * Detect if query spans multiple sessions (multi-hop queries)
 * Only triggers for explicit multi-session indicators, NOT temporal words
 */
function isMultiSessionQuery(query: string): boolean {
  const multiSessionIndicators = [
    'across sessions', 'between sessions', 'another session',
    'different session', 'previous session', 'next session',
    'session', 'dialogue', 'conversation'
  ];
  const lower = query.toLowerCase();
  return multiSessionIndicators.some(w => lower.includes(w));
}

function normalizeVisibilityScopes(
  visibilityScope?: SearchInput['visibilityScope']
): VisibilityScope[] | null {
  if (!visibilityScope) return null;
  return Array.isArray(visibilityScope) ? visibilityScope : [visibilityScope];
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
 * Expand query for multi-session retrieval
 */
function expandQueryForMultiSession(query: string): string[] {
  const expansions = [query];
  const lower = query.toLowerCase();

  // Add time-based expansions
  if (lower.includes('when')) {
    expansions.push(query.replace(/when/i, '').trim());
  }
  if (lower.includes('before') || lower.includes('after')) {
    expansions.push(query.replace(/before|after/i, '').trim());
  }
  if (lower.includes('earlier') || lower.includes('later')) {
    expansions.push(query.replace(/earlier|later/i, '').trim());
  }

  // Add "mentioning" expansions for factual queries
  if (lower.includes('what') || lower.includes('how')) {
    expansions.push(query + ' mentioned');
    expansions.push(query + ' said');
  }

  return [...new Set(expansions.filter(e => e.length > 2))];
}

/**
 * Expand query for temporal retrieval - add date/temporal context
 */
function expandQueryForTemporal(query: string): string[] {
  const expansions = [query];
  const lower = query.toLowerCase();

  // For "when" questions, search with entity + date context
  if (lower.includes('when')) {
    // Extract entity name (everything after "when did" or "when is")
    const entityMatch = query.match(/when\s+(?:did|is|was|were)\s+(\w+)/i);
    if (entityMatch) {
      const entity = entityMatch[1];
      // Search with entity name alone (might match date mentions)
      expansions.push(entity);
      expansions.push(query.replace(/when\s+(?:did|is|was|were)\s+/i, '').trim());
    }
  }

  // Add "date" and "time" expansions
  if (lower.includes('when') || lower.includes('how long') || lower.includes('ago')) {
    expansions.push(query + ' date');
    expansions.push(query + ' time');
  }

  return [...new Set(expansions.filter(e => e.length > 2))];
}

export interface HybridSearchOptions {
  limit?: number;
  project?: string;
  type?: string;
  tags?: string[];
  enableMultiSession?: boolean; // Enable multi-session expansion
  enableGraphTraversal?: boolean; // Enable multi-hop graph traversal (Task 4)
  enableHeuristics?: boolean;
  includeAssociations?: boolean;
}

/**
 * Cached DB context for a single search operation.
 * Avoids redundant getDb()/createDatabaseClient() calls across
 * vectorSearch, keywordSearch, and helper functions.
 */
interface SearchDbContext {
  dbClient: ReturnType<typeof createDatabaseClient>;
  /** Raw drizzle DB instance for direct query builder usage */
  db: Awaited<ReturnType<typeof getDb>>;
}

/**
 * Score with recency + similarity + entity boost (NO LLM required)
 */
function scoreWithHeuristics(
  result: SearchResult,
  query: string,
  now: number
): number {
  let score = result.similarity ?? 0;

  // 1. Recency boost: Recent = higher (up to +0.1)
  if (result.createdAt) {
    const created = new Date(result.createdAt).getTime();
    const ageHours = (now - created) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 0.1 * Math.exp(-ageHours / 720)); // Decay over 30 days
    score += recencyScore;
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
async function getMemoryPlacesByType(
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
async function getMemoriesByIndexedTags(
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
    const results = await sqliteDb.select({
      memoryId: schema.memoryTags.memoryId,
      tag: schema.memoryTags.tag,
    })
      .from(schema.memoryTags)
      .where(inArray(schema.memoryTags.tag, tags))
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
async function getSupersededMemoryIds(projectId?: string, ctx?: SearchDbContext): Promise<Set<string>> {
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
async function applyMultiPlaceScoring(
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
async function applyTagOverlapBoost(
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
async function applySupersessionFilter(
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
 * Main search function - vectors + graph boost + heuristics + places + sessions
 * Unified search integrating Places, Graph, and Memory
 */
export async function hybridSearch(
  input: SearchInput,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const limit = options.limit ?? input.limit ?? 10;
  const enableMultiSession = options.enableMultiSession !== false;
  const enableHeuristics = options.enableHeuristics !== false;
  const isMultiHop = enableMultiSession && isMultiSessionQuery(input.query);
  const isTemporal = isTemporalQuery(input.query);
  const traceEnabled = input.trace === true;

  // Advanced Retrieval: Query Expansion
  // Expand query with synonyms before searching if enabled
  const queryExpansionEnabled = process.env.SQUISH_QUERY_EXPANSION === 'true';
  let expandedQueries: string[] = [input.query || ''];
  
  if (queryExpansionEnabled && input.query && input.query.trim().length > 0) {
    expandedQueries = expandQuery(input.query, { enabled: true, maxExpansions: 3 });
    logger.debug(`[HybridSearch] Query expanded to ${expandedQueries.length} variants`);
  }

  // Advanced Retrieval: Entity Extraction
  // Extract entities from query for entity-aware boosting
  const entityRetrievalEnabled = process.env.SQUISH_ENTITY_RETRIEVAL === 'true';
  const queryEntities = entityRetrievalEnabled && input.query
    ? extractQueryEntities(input.query)
    : [];
  
  if (queryEntities.length > 0) {
    logger.debug(`[HybridSearch] Extracted ${queryEntities.length} entities: ${queryEntities.join(', ')}`);
  }

  // Pre-compute query embedding once to avoid redundant API calls.
  // This embedding is used by vectorSearch and MMR diversity.
  const isEmptyQuery = !input.query || input.query.trim() === '';
  const queryEmbedding = isEmptyQuery ? null : await getEmbedding(input.query);

  // Cache DB client once per search operation to avoid redundant getDb()/createDatabaseClient() calls
  const rawDb = await getDb();
  const searchCtx: SearchDbContext = {
    dbClient: createDatabaseClient(rawDb),
    db: rawDb,
  };

  // Initialize trace object for debugging (Phase 8)
  const trace: RetrievalTrace = {
    selectedPlace: input.placeType ?? questionPlaceType(input.query) ?? null,
    fallbackUsed: false,
    fallbackPlaces: [],
    matchedPlaces: [],
    matchedTags: [],
    scoreBreakdown: {},
    scoreBreakdowns: [],
    supersededFiltered: 0,
    totalCandidates: 0,
    finalOrder: [],
    finalResultCount: 0,
  };

  let vectorResults: SearchResult[];

  if (isMultiHop) {
    // Multi-hop: use expansion to get more coverage
    const expandedQueries = expandQueryForMultiSession(input.query);
    const allResults: SearchResult[] = [];

    for (const expQuery of expandedQueries) {
      // For expanded queries, compute embedding per expansion (query text changes)
      const expEmbedding = await getEmbedding(expQuery);
      const expResults = await vectorSearch(
        { ...input, query: expQuery },
        { ...options, limit: Math.ceil(limit * 2) },
        expEmbedding,
        searchCtx
      );
      allResults.push(...expResults);
    }

    const byId = new Map<string, SearchResult>();
    for (const r of allResults) {
      const existing = byId.get(r.id);
      if (!existing || (r.similarity ?? 0) > (existing.similarity ?? 0)) {
        byId.set(r.id, r);
      }
    }
    vectorResults = Array.from(byId.values());
  } else if (isTemporal) {
    // Temporal: fetch more results
    vectorResults = await vectorSearch(input, { ...options, limit: limit * 4 }, queryEmbedding, searchCtx);
  } else if (queryExpansionEnabled && expandedQueries.length > 1) {
    // Advanced Query Expansion: search with expanded queries and merge results
    const allResults: SearchResult[] = [];
    
    for (const expQuery of expandedQueries) {
      const expEmbedding = await getEmbedding(expQuery);
      const expResults = await vectorSearch(
        { ...input, query: expQuery },
        { ...options, limit: Math.ceil(limit * 1.5) },
        expEmbedding,
        searchCtx
      );
      allResults.push(...expResults);
    }
    
    // Merge results, keeping highest similarity for each memory
    const byId = new Map<string, SearchResult>();
    for (const r of allResults) {
      const existing = byId.get(r.id);
      if (!existing || (r.similarity ?? 0) > (existing.similarity ?? 0)) {
        byId.set(r.id, r);
      }
    }
    vectorResults = Array.from(byId.values());
    vectorResults.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  } else {
    // Regular query
    vectorResults = await vectorSearch(input, { ...options, limit: limit * 2 }, queryEmbedding, searchCtx);
  }

  // Record total candidates for trace
  trace.totalCandidates = vectorResults.length;

  // FTS5 keyword search + RRF fusion: add keyword signal and fuse with vector results
  // This is the industry standard (TrueMemory episodic layer, MemPalace FTS5, etc.)
  const keywordResults = await keywordSearch(input, limit * 2, searchCtx);
  if (keywordResults.length > 0) {
    vectorResults = rrfFusion(vectorResults, keywordResults, limit * 3);
  }

  // v1.5.0: Place-aware scoring using indexed memory_places queries
  const retrievalConfig = getRetrievalConfig();
  if (input.project || input.placeType) {
    vectorResults = await applyMultiPlaceScoring(vectorResults, input, limit, retrievalConfig, searchCtx);
    // Track matched places for trace
    if (trace.selectedPlace) {
      trace.matchedPlaces.push(trace.selectedPlace);
    }
    const adjacentPlaces = getQuestionAdjacentPlaces(trace.selectedPlace as any);
    trace.fallbackPlaces = adjacentPlaces;
    if (adjacentPlaces.length > 0) {
      trace.fallbackUsed = true;
      trace.matchedPlaces.push(...adjacentPlaces);
    }
  }

  // v1.5.0: Tag overlap boost using indexed memory_tags
  const queryTags = input.tags ?? [];
  if (queryTags.length > 0) {
    vectorResults = await applyTagOverlapBoost(vectorResults, queryTags, retrievalConfig.scoring, searchCtx);
    trace.matchedTags = [...queryTags];
  }

  // Task 3: Add session temporal scope
  // If sessionId specified, boost memories from same session
  if (input.sessionId) {
    vectorResults = applySessionBoost(vectorResults, input.sessionId);
  }

  // TEMPORAL: Boost results with dates for temporal queries
  if (isTemporal) {
    vectorResults = applyTemporalBoost(vectorResults);
  }

  // Apply heuristics if enabled (recency + entity overlap)
  if (enableHeuristics) {
    const now = Date.now();
    vectorResults = vectorResults.map(r => ({
      ...r,
      similarity: scoreWithHeuristics(r, input.query, now)
    }));
  }

  // Advanced Retrieval: Entity-Aware Boost
  // Boost results that share entities with the query
  if (entityRetrievalEnabled && queryEntities.length > 0) {
    vectorResults = entityBoost(vectorResults, queryEntities);
    logger.debug(`[HybridSearch] Entity boost applied with ${queryEntities.length} entities`);
  }

  // Graph boost
  const graphWeight = config.scoringWeights.graphBoost;
  const candidateIds = vectorResults.map(r => r.id);
  const graphBoostMap = await computeGraphBoost(candidateIds);

  let results = applyGraphBoostWithWeight(vectorResults, graphBoostMap, limit, graphWeight);

  // v1.5.0: Filter or penalize superseded memories
  const { filtered: supersededResults, supersededCount } = await applySupersessionFilter(
    results, input.project, retrievalConfig.includeSuperseded, retrievalConfig, searchCtx
  );
  trace.supersededFiltered = supersededCount;
  results = supersededResults;

  // Advanced Retrieval: Temporal Validity
  // Downrank or filter stale memories based on temporal references
  const temporalValidityEnabled = process.env.SQUISH_TEMPORAL_VALIDITY === 'true';
  if (temporalValidityEnabled) {
    const stalePenalty = 0.3; // Penalty for stale memories
    let staleCount = 0;
    
    results = results.map(r => {
      // Check if memory content has temporal references and is likely stale
      if (r.content && r.createdAt) {
        const stale = isLikelyStale({
          content: r.content,
          createdAt: r.createdAt,
          lastAccessedAt: r.lastAccessedAt as string | undefined,
        });
        
        if (stale) {
          staleCount++;
          return {
            ...r,
            similarity: Math.max(0, (r.similarity ?? 0) - stalePenalty),
          };
        }
      }
      return r;
    });
    
    // Re-sort after applying staleness penalty
    results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    
    if (staleCount > 0) {
      logger.debug(`[HybridSearch] Temporal validity: ${staleCount} stale memories downranked`);
    }
  }

  // Expand with associated memories for better coverage
  if (options.includeAssociations !== false) {
    results = await expandWithAssociations(results, limit);
  }

  // Task 4: Enable multi-hop graph traversal by default
  // If query is detected as multi-hop, use actual graph traversal
  if (isMultiHop && options.enableGraphTraversal !== false && input.project) {
    try {
      const graphResults = await multiHopSearch({
        query: input.query,
        project: input.project,
        limit: limit,
        includeVectorResults: false,
        includeGraphResults: true,
      });

      // Merge graph results with vector results
      const existingIds = new Set(results.map(r => r.id));
      for (const gr of graphResults) {
        if (!existingIds.has(gr.id)) {
          results.push({
            ...gr,
            similarity: (gr.similarity ?? 0) * 0.9 // Slightly lower weight
          });
        }
      }

      // Re-sort
      results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    } catch (e) {
      // Multi-hop failed, continue with vector results
      logger.debug(`[HybridSearch] Multi-hop failed: ${e}`);
    }
  }

  // LLM reranking: when LLM is enabled and query is meaningful, optionally rerank
  // This is a config-gated enhancement, not the default behavior
  if (config.llmEnabled && input.query && input.query.trim().length > 5) {
    try {
      results = await rerankWithLLM(results, input.query, limit);
    } catch {
      // LLM reranking failed silently - continue with existing results
      logger.debug('[HybridSearch] LLM reranking failed, using original order');
    }
  }

  // Cross-Encoder Reranking: precision reranking using cross-encoder model
  // Higher quality than LLM reranking, runs locally
  if (config.rerankerEnabled && input.query && input.query.trim().length > 5) {
    try {
      results = await rerankResults(input.query, results, {
        topK: config.rerankerTopK,
        returnTopK: limit,
        blendWeight: 0.7,
      });
      logger.debug(`[HybridSearch] Cross-encoder reranking applied, ${results.length} results`);
    } catch (e) {
      // Cross-encoder reranking failed silently
      logger.debug(`[HybridSearch] Cross-encoder reranking failed: ${e}`);
    }
  }

  // MMR Diversity: inject diversity to prevent redundant results
  if (config.mmrEnabled && results.length > 0 && queryEmbedding) {
    try {
      // Use pre-computed query embedding (avoids redundant API call)
      results = smartMMR(queryEmbedding, results, {
        lambda: config.mmrLambda,
        topK: limit,
        candidatePool: 50,
      });
      logger.debug(`[HybridSearch] MMR diversity applied, ${results.length} results`);
    } catch (e) {
      // MMR failed silently
      logger.debug(`[HybridSearch] MMR diversity failed: ${e}`);
    }
  }

  // Build trace metadata (Phase 8)
  trace.finalOrder = results.map(r => r.id);
  trace.finalResultCount = results.length;
  for (const r of results) {
    trace.scoreBreakdown[r.id] = r.similarity ?? 0;
  }

  const visibilityScopes = normalizeVisibilityScopes(input.visibilityScope);
  if (visibilityScopes && visibilityScopes.length > 0) {
    results = results.filter((result: any) => {
      const scope = (result.visibilityScope ?? result.visibility_scope ?? 'private') as VisibilityScope;
      return visibilityScopes.includes(scope);
    });
    trace.finalOrder = results.map(r => r.id);
    trace.finalResultCount = results.length;
  }

  // Attach trace to results when trace mode is enabled
  if (traceEnabled) {
    for (const r of results) {
      r._trace = trace;
    }
  }

  return results;
}

/**
 * Task 3: Boost memories from the same session (temporal)
 */
function applySessionBoost(
  results: SearchResult[],
  sessionId: string
): SearchResult[] {
  const SESSION_BOOST = 0.1;

  const boosted = results.map(r => {
    // Check if memory's session matches query's session
    const memSession = r.metadata?.sessionMetadata?.sessionId as string | undefined;
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
function applyTemporalBoost(results: SearchResult[]): SearchResult[] {
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
 * Expand results with directly associated memories
 */
async function expandWithAssociations(
  results: SearchResult[],
  limit: number
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
 * FTS5 keyword search using SQLite's built-in FTS5.
 * Squish already has memories_fts table - this connects it to hybrid search.
 * Provides keyword-based retrieval as a second signal alongside vector similarity.
 */
export async function keywordSearch(
  input: SearchInput,
  limit: number,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  try {
    const dbClient = ctx?.dbClient ?? createDatabaseClient(await getDb());
    const sqlite = dbClient.$client as any;

    // Sanitize query for FTS5: remove special chars, keep meaningful words
    const ftsQuery = (input.query || '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => `"${w}"`)
      .join(' OR ');

    if (!ftsQuery) return [];

    const conditions: string[] = ['memories_fts MATCH ?'];
    const params: any[] = [ftsQuery];

    if (input.project) {
      const project = await requireProject(input.project);
      conditions.push('m.project_id = ?');
      params.push(project.id);
    }

    if (input.type) {
      conditions.push('m.type = ?');
      params.push(input.type);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const query = `
      SELECT
        m.id as id,
        m.project_id as projectId,
        m.type as type,
        m.content as content,
        m.summary as summary,
        m.tags as tags,
        m.metadata as metadata,
        m.created_at as createdAt,
        rank as similarity
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      ${whereClause}
      ORDER BY rank
      LIMIT ?
    `;

    const rows = sqlite.prepare(query).all(...params, limit) as Array<{
      id: string;
      projectId: string | null;
      type: string;
      content: string;
      summary: string | null;
      tags: string | null;
      metadata: string | null;
      createdAt: string | null;
      similarity: number;
    }>;

    return rows.map(item => ({
      id: item.id,
      projectId: item.projectId,
      type: item.type as any,
      content: item.content,
      summary: item.summary ?? undefined,
      tags: deserializeTags(item.tags ?? null),
      metadata: deserializeMetadata(item.metadata ?? null),
      createdAt: item.createdAt ? (normalizeTimestamp(Number(item.createdAt)) ?? undefined) : undefined,
      similarity: -item.similarity, // FTS5 rank is negative (lower = better), negate for consistency
    }));
  } catch (error: any) {
    // FTS5 may fail if no content table or malformed query
    logger.debug(`[FTS5] Keyword search failed: ${error.message}`);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion (RRF) for combining multiple search signals.
 * Fuses vector similarity results with FTS5 keyword results.
 * This is the industry standard approach (Mem0, TrueMemory, etc.).
 */
export function rrfFusion(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  limit: number,
  k: number = 60
): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>();

  // Add vector results with RRF score
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1.0 / (k + rank);
    scores.set(result.id, { result, score: rrfScore });
  });

  // Add keyword results with RRF score (fused)
  keywordResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1.0 / (k + rank);
    const existing = scores.get(result.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(result.id, { result, score: rrfScore });
    }
  });

  // Sort by fused RRF score descending
  const fused = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Normalize similarity to [0, 1] for consistency with existing pipeline
  const maxScore = fused.length > 0 ? fused[0].score : 1;
  return fused.map(item => ({
    ...item.result,
    similarity: maxScore > 0 ? item.score / maxScore : 0,
  }));
}
async function vectorSearch(
  input: SearchInput,
  options: HybridSearchOptions,
  precomputedEmbedding?: number[] | null,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  try {
    const dbClient = ctx?.dbClient ?? createDatabaseClient(await getDb());
    const sqlite = dbClient.$client as any;
    const limit = options.limit ?? 10;
    const tags = normalizeTags(options.tags ?? input.tags);

    // Check for empty query
    const isEmptyQuery = !input.query || input.query.trim() === '';

    // Use pre-computed embedding if provided, otherwise compute it
    let queryEmbedding: number[] | null = null;
    if (precomputedEmbedding !== undefined) {
      queryEmbedding = precomputedEmbedding;
    } else if (!isEmptyQuery) {
      queryEmbedding = await getEmbedding(input.query);
    }

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    if (input.type) {
      conditions.push('m.type = ?');
      params.push(input.type);
    }

    if (tags.length) {
      conditions.push('(' + tags.map(() => 'm.tags LIKE ?').join(' OR ') + ')');
      params.push(...tags.map((tag) => `%${tag}%`));
    }

    let projectId: string | null = null;
    if (input.project) {
      const project = await requireProject(input.project);
      projectId = project.id;
      conditions.push('m.project_id = ?');
      params.push(project.id);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Fetch candidates for vector search
    const statement = sqlite.prepare(`
      SELECT
        m.id as id,
        m.project_id as projectId,
        m.type as type,
        m.content as content,
        m.summary as summary,
        m.tags as tags,
        m.metadata as metadata,
        m.embedding as embedding,
        m.embedding_json as embeddingJson,
        m.created_at as createdAt
      FROM memories m
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ?
    `);

    const rows = statement.all(...params, limit * 3) as Array<{
      id: string;
      projectId: string | null;
      type: string;
      content: string;
      summary: string | null;
      tags: string | null;
      metadata: string | null;
      embedding: any;
      embeddingJson: any;
      createdAt: string | null;
    }>;

    // If no embedding available, return results ordered by recency
    if (!queryEmbedding) {
      return rows.slice(0, limit * 2).map((item) => ({
        id: item.id,
        projectId: item.projectId,
        type: item.type as any,
        content: item.content,
        summary: item.summary ?? undefined,
        tags: deserializeTags(item.tags ?? null),
        metadata: deserializeMetadata(item.metadata ?? null),
        createdAt: item.createdAt ? (normalizeTimestamp(Number(item.createdAt)) ?? undefined) : undefined,
        similarity: 0,
      }));
    }

    // Calculate cosine similarity for each result
    const scored = rows
      .map((row) => {
        const embedding = parseEmbedding(row.embedding) ?? parseEmbedding(row.embeddingJson);
        if (!embedding) return null;

        const similarity = cosineSimilarity(queryEmbedding!, embedding);
        return {
          id: row.id,
          projectId: row.projectId,
          type: row.type,
          content: row.content,
          summary: row.summary,
          tags: row.tags,
          metadata: row.metadata,
          createdAt: row.createdAt,
          similarity,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort by similarity (descending) and return
    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, limit * 2).map((item) => ({
      id: item.id,
      projectId: item.projectId,
      type: item.type as any,
      content: item.content,
      summary: item.summary ?? undefined,
      tags: deserializeTags(item.tags ?? null),
      metadata: deserializeMetadata(item.metadata ?? null),
      createdAt: item.createdAt ? (normalizeTimestamp(Number(item.createdAt)) ?? undefined) : undefined,
      similarity: item.similarity,
    }));
  } catch (error: any) {
    throw error;
  }
}

/**
 * Optional LLM reranking of search results.
 * Uses LLM to score top results against the query.
 * Falls back silently on any error - never blocks search.
 * Limited to top results for performance.
 * Exported for testing.
 */
export async function rerankWithLLM(
  results: SearchResult[],
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const TOP_K = 5; // Only rerank top N results
  const candidates = results.slice(0, TOP_K);

  if (candidates.length < 2) return results;

  // Build a prompt asking LLM to rank by relevance
  const items = candidates
    .map((r, i) => `[${i + 1}] ${(r.content ?? '').slice(0, 200)}`)
    .join('\n\n');

  const prompt = `Given the search query: "${query}"

Rate each result's relevance to the query from 0 (not relevant) to 10 (highly relevant).
Return ONLY a comma-separated list of scores, one per result.

Results:
${items}

Scores:`;

  const response = await callLLM(prompt);
  if (!response) return results;

  // Parse scores: expect comma-separated numbers
  const scoreStrs = response.split(',').map(s => s.trim());
  if (scoreStrs.length !== candidates.length) return results;

  const scores = scoreStrs.map(s => {
    const num = parseFloat(s);
    return isNaN(num) ? 5 : Math.max(0, Math.min(10, num));
  });

  // Blend LLM score with existing similarity (50/50 blend)
  const blended = candidates.map((r, i) => ({
    ...r,
    similarity: ((r.similarity ?? 0) * 0.5) + ((scores[i] / 10) * 0.5),
  }));

  // Sort by blended score, then append remaining results
  blended.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  const remaining = results.slice(TOP_K);
  return [...blended, ...remaining].slice(0, limit);
}

/**
 * Apply small graph boost to results
 * Graph boost is ADDITIVE (not dominating)
 */
function applyGraphBoostWithWeight(
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
