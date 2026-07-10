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
export { keywordSearch, rrfFusion } from './keyword-search.js';
export { vectorSearch, type SearchDbContext } from './vector-search.js';
export { applyMultiPlaceScoring, applyTagOverlapBoost, applySessionBoost, applyTemporalBoost, applySupersessionFilter, applyGraphBoostWithWeight, expandWithAssociations, scoreWithHeuristics, getMemoryPlacesByType, getMemoriesByIndexedTags, getSupersededMemoryIds, } from './search-scoring.js';
export interface HybridSearchOptions {
    limit?: number;
    project?: string;
    type?: string;
    tags?: string[];
    enableMultiSession?: boolean;
    enableGraphTraversal?: boolean;
    enableHeuristics?: boolean;
    includeAssociations?: boolean;
}
/**
 * Main search function - vectors + graph boost + heuristics + places + sessions
 * Unified search integrating Places, Graph, and Memory
 */
export declare function hybridSearch(input: SearchInput, options?: HybridSearchOptions): Promise<SearchResult[]>;
/**
 * Optional LLM reranking of search results.
 * Uses LLM to score top results against the query.
 * Falls back silently on any error - never blocks search.
 * Limited to top results for performance.
 * Exported for testing.
 */
export declare function rerankWithLLM(results: SearchResult[], query: string, limit: number): Promise<SearchResult[]>;
//# sourceMappingURL=hybrid-search.d.ts.map