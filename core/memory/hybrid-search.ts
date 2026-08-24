/**
 * Hybrid Search Orchestrator
 *
 * Coordinates vector search, keyword search, scoring, and ranking.
 * The individual components are in separate modules:
 * - vector-search.ts: Vector similarity search
 * - keyword-search.ts: FTS5 keyword search + RRF fusion
 * - search-scoring.ts: All scoring/ranking/filtering helpers
 */

import type { SearchResult, SearchInput } from './memories.js';
export type { SearchResult } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../storage/database.js';
import { getEmbedding } from '../../core/embeddings.js';
import config from '../../config.js';
import { multiHopSearch } from '../graph/multi-hop-retrieval.js';
import { callLLM } from '../llm/client.js';
import { logger } from '../logger.js';
import { getRetrievalConfig, getPrecisionStackFlags, getGraphBoostFlags, type SquishRetrievalConfig, type RetrievalScoringConfig, type RetrievalTrace } from '../retrieval/config.js';
import { questionPlaceType } from '../places/question-router.js';
import { getAdjacentPlaces as getQuestionAdjacentPlaces } from '../places/rules.js';
import { normalizeVisibilityScopes, type VisibilityScope } from '../lib/utils.js';

// Enhanced retrieval modules
import { rerankResults } from '../retrieval/cross-encoder-reranker.js';
import { enrichContent } from '../retrieval/contextual-enrichment.js';
import { smartMMR } from '../retrieval/mmr-diversity.js';

// Advanced retrieval modules
import { expandQuery } from '../retrieval/query-expansion.js';
import { extractQueryEntities, entityBoost } from '../retrieval/entity-aware-retrieval.js';
import { detectTemporalReferences, isLikelyStale } from '../retrieval/temporal-validity.js';

/**
 * Merge results by ID, keeping the one with the highest similarity.
 * Batch 3: prefers honest semanticScore when present (dedup must not be
 * skewed by accumulated boosts).
 */
function deduplicateById(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  for (const r of results) {
    const score = (r.semanticScore ?? r.similarity ?? 0);
    const existing = seen.get(r.id);
    if (!existing || score > (existing.semanticScore ?? existing.similarity ?? 0)) {
      seen.set(r.id, r);
    }
  }
  return Array.from(seen.values());
}

// Graph boost
// Batch 5: normalized (default) or legacy raw mode via SQUISH_GRAPH_BOOST_LEGACY.
import { computeGraphBoost, calculateGraphBoostNormalized } from '../search/graph-boost.js';

// Imports from split modules
import { vectorSearch, type SearchDbContext } from './vector-search.js';
import { keywordSearch, rrfFusion } from './keyword-search.js';
import {
  heuristicComponents,
  applyMultiPlaceScoring,
  applyTagOverlapBoost,
  applySessionBoost,
  applyTemporalBoost,
  applySupersessionFilter,
  applyGraphBoostWithWeight,
  expandWithAssociations,
} from './search-scoring.js';
import {
  SCORING_SCHEMA_VERSION,
  getScoringFlags,
  initScoreFields,
  finalizeScores,
  addBoost,
  applyReplacement,
  deriveShadowDelta,
  recordShadowDelta,
} from '../scoring/three-field.js';
import { getLastRerankMeta } from '../retrieval/cross-encoder-reranker.js';

// Re-export from sub-modules for backward compatibility
export { keywordSearch, rrfFusion } from './keyword-search.js';
export { vectorSearch, type SearchDbContext } from './vector-search.js';
export {
  applyMultiPlaceScoring,
  applyTagOverlapBoost,
  applySessionBoost,
  applyTemporalBoost,
  applySupersessionFilter,
  applyGraphBoostWithWeight,
  expandWithAssociations,
  scoreWithHeuristics,
  getMemoryPlacesByType,
  getMemoriesByIndexedTags,
  getSupersededMemoryIds,
} from './search-scoring.js';

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

  // Batch 5: precision stack flags - all default ON, individually disableable.
  const precision = getPrecisionStackFlags();

  // Advanced Retrieval: Query Expansion
  // Expand query with synonyms before searching if enabled
  const queryExpansionEnabled = precision.queryExpansion;
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

    vectorResults = deduplicateById(allResults);
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
    vectorResults = deduplicateById(allResults);
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

  // Batch 3: from here on every candidate carries the explicit three-field
  // semantics. semanticScore is now frozen (cosine or normalized RRF) and
  // never overwritten; all adjustments below are additive boosts.
  vectorResults = initScoreFields(vectorResults);

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
  // Batch 3: itemized as heuristicRecency / heuristicEntityOverlap boosts.
  // semanticScore stays untouched - the composite moves, the honest
  // retrieval relevance does not.
  if (enableHeuristics) {
    const now = Date.now();
    vectorResults = vectorResults.map(r => {
      const { recency, entityOverlap } = heuristicComponents(r, input.query, now);
      let out = addBoost(r, 'heuristicRecency', recency);
      return addBoost(out, 'heuristicEntityOverlap', entityOverlap);
    });
  }

  // Advanced Retrieval: Entity-Aware Boost
  // Boost results that share entities with the query
  if (entityRetrievalEnabled && queryEntities.length > 0) {
    vectorResults = entityBoost(vectorResults, queryEntities);
    logger.debug(`[HybridSearch] Entity boost applied with ${queryEntities.length} entities`);
  }

  // Graph boost (Batch 5): the boost map is normalized WITHIN the candidate
  // set to 0..1 before applying config weight (default 0.10), so the maximum
  // possible contribution is +weight instead of the legacy +3.0 x weight.
  // Coactivation counts are log-scaled so hub memories cannot dominate.
  // SQUISH_GRAPH_BOOST_LEGACY=true restores the pre-Batch-5 absolute mode.
  const graphWeight = config.scoringWeights.graphBoost;
  const graphMode = getGraphBoostFlags();
  const candidateIds = vectorResults.map(r => r.id);

  let results: SearchResult[];
  if (graphMode.legacy) {
    const graphBoostMap = await computeGraphBoost(candidateIds);
    results = applyGraphBoostWithWeight(vectorResults, graphBoostMap, limit, graphWeight);
  } else {
    const { normalized } = await calculateGraphBoostNormalized(candidateIds);
    results = applyGraphBoostWithWeight(vectorResults, Object.fromEntries(normalized), limit, graphWeight);
  }

  // v1.5.0: Filter or penalize superseded memories
  const { filtered: supersededResults, supersededCount } = await applySupersessionFilter(
    results, input.project, retrievalConfig.includeSuperseded, retrievalConfig, searchCtx
  );
  trace.supersededFiltered = supersededCount;
  results = supersededResults;

  // Advanced Retrieval: Temporal Validity
  // Downrank or filter stale memories based on temporal references
  // Batch 5: opt-in (SQUISH_TEMPORAL_VALIDITY=true). Default OFF after the
  // golden-eval gate showed a recall/mrr/hitAt1 breach from the flat
  // staleness penalty on aged corpora.
  const temporalValidityEnabled = precision.temporalValidity;
  if (temporalValidityEnabled) {
    const stalePenalty = 0.3; // Penalty for stale memories
    let staleCount = 0;
    
    results = results.map(r => {
      // Check if memory content has temporal references and is likely stale
      if (r.content && r.createdAt) {
        const stale = isLikelyStale({
          content: r.content,
          createdAt: r.createdAt,
          lastAccessedAt: (r as any).lastAccessedAt as string | undefined,
        });

        if (stale) {
          staleCount++;
          // Batch 3: itemized 'stalenessPenalty'; legacy floored composite at 0.
          const penalized = addBoost(r, 'stalenessPenalty', -stalePenalty);
          return { ...penalized, similarity: Math.max(0, penalized.similarity ?? 0) };
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
    results = await expandWithAssociations(results, limit, {
      includeConsolidatedSources: input.includeConsolidatedSources === true,
    });
  }

  // Task 4: Enable multi-hop graph traversal by default
  // If query is detected as multi-hop, use actual graph traversal.
  // Batch 2 note: multiHopSearch rehydrates candidates through hybridSearch
  // internally, so those results inherit the same status/consolidation
  // SQL filters as the primary legs - no separate filtering needed here.
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
          // Batch 3: graph-leg entries enter at their honest base weight with
          // the legacy 10% discount itemized as multiHopWeight.
          const base = gr.similarity ?? 0;
          const seeded = initScoreFields([{ ...gr, similarity: base }])[0];
          results.push(addBoost(seeded, 'multiHopWeight', -(base * 0.1)));
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
  // Higher quality than LLM reranking, runs locally.
  // Batch 5: default ON (SQUISH_RERANKER_ENABLED=false to disable). When the
  // transformers module is unavailable or the model cannot load within the
  // timeout cap, reranking skips silently and skips are counted in the trace.
  if (precision.reranker && input.query && input.query.trim().length > 5) {
    try {
      const reranked = await rerankResults(input.query, results, {
        topK: config.rerankerTopK,
        returnTopK: limit,
        blendWeight: 0.7,
      });
      // Batch 3: cross-encoder replaces the ranking signal. Fold the delta
      // into boostScore (rerankResidual) so the three-field identity holds.
      results = reranked.map(r => applyReplacement(r, r.similarity ?? 0));
      const rerankMeta = getLastRerankMeta();
      trace.reranker = rerankMeta
        ? { applied: rerankMeta.applied, skipped: rerankMeta.skipped, reason: rerankMeta.reason }
        : { applied: true, skipped: 0 };
      logger.debug(`[HybridSearch] Cross-encoder reranking applied, ${results.length} results`);
    } catch (e) {
      // Cross-encoder reranking failed silently - never blocks search
      trace.reranker = { applied: false, skipped: results.length, reason: String(e) };
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

  // Batch 3: final score semantics. Serving mode decides what `similarity`
  // aliases and which ordering is served:
  //   v2 (default)     -> similarity = finalScore = clamp01(semantic+boost),
  //                       ordered by finalScore
  //   legacy           -> similarity = unclamped composite (exact pre-batch-3
  //                       accumulation), pipeline ordering preserved
  // Shadow (optional, independent) derives both orderings from the same
  // candidate set and records top-5 deltas into a bounded ring.
  const scoringFlags = getScoringFlags();

  if (scoringFlags.shadow && input.query) {
    try {
      recordShadowDelta(deriveShadowDelta(input.query, results));
    } catch {
      // Shadow must never affect serving
    }
  }

  results = finalizeScores(results, scoringFlags.serveV2);

  // Build trace metadata (Phase 8)
  trace.scoringSchemaVersion = SCORING_SCHEMA_VERSION;
  trace.scoringServeMode = scoringFlags.serveV2 ? 'v2' : 'legacy';
  trace.graphBoostMode = graphMode.legacy ? 'legacy' : 'normalized';
  if (scoringFlags.shadow && input.query) {
    try {
      trace.shadowDelta = deriveShadowDelta(input.query, results);
    } catch {
      // Trace diagnostics are best-effort
    }
  }
  trace.finalOrder = results.map(r => r.id);
  trace.finalResultCount = results.length;
  for (const r of results) {
    // memoryId -> served score (finalScore under v2, legacy composite under legacy)
    trace.scoreBreakdown[r.id] = r.similarity ?? 0;
  }

  logger.debug(
    `[HybridSearch] scoring schema=${SCORING_SCHEMA_VERSION} serve=${trace.scoringServeMode}` +
    `${scoringFlags.shadow ? ' shadow=on' : ''}${trace.shadowDelta ? ` overlap=${trace.shadowDelta.overlap}/5` : ''}`
  );

  // Attach trace to results when trace mode is enabled
  if (traceEnabled) {
    for (const r of results) {
      r._trace = trace;
    }
  }

  return results;
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
  // Batch 3: replacement folds into boostScore as rerankResidual.
  const blended = candidates.map((r, i) =>
    applyReplacement(r, ((r.similarity ?? 0) * 0.5) + ((scores[i] / 10) * 0.5))
  );

  // Sort by blended score, then append remaining results
  blended.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  const remaining = results.slice(TOP_K);
  return [...blended, ...remaining].slice(0, limit);
}
