/**
 * Vector Search - Pure semantic search with optional graph boosting + multi-session support
 *
 * Uses cosine similarity on embeddings + optional graph boost
 * BM25 removed - use qmd-client for BM25 + vectors + reranking
 */
import type { SearchResult, SearchInput } from './memories.js';
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
 * FTS5 keyword search using SQLite's built-in FTS5.
 * Squish already has memories_fts table - this connects it to hybrid search.
 * Provides keyword-based retrieval as a second signal alongside vector similarity.
 */
export declare function keywordSearch(input: SearchInput, limit: number): Promise<SearchResult[]>;
/**
 * Reciprocal Rank Fusion (RRF) for combining multiple search signals.
 * Fuses vector similarity results with FTS5 keyword results.
 * This is the industry standard approach (Mem0, TrueMemory, etc.).
 */
export declare function rrfFusion(vectorResults: SearchResult[], keywordResults: SearchResult[], limit: number, k?: number): SearchResult[];
/**
 * Optional LLM reranking of search results.
 * Uses LLM to score top results against the query.
 * Falls back silently on any error - never blocks search.
 * Limited to top results for performance.
 * Exported for testing.
 */
export declare function rerankWithLLM(results: SearchResult[], query: string, limit: number): Promise<SearchResult[]>;
//# sourceMappingURL=hybrid-search.d.ts.map