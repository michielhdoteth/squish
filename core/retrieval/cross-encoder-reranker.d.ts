/**
 * Cross-Encoder Reranker - Precision reranking for search results
 *
 * Uses cross-encoder models to jointly attend over query-document pairs
 * for more accurate relevance scoring than bi-encoder cosine similarity.
 *
 * Models:
 *   - cross-encoder/ms-marco-MiniLM-L-6-v2 (fast, English, ~80MB)
 *   - BAAI/bge-reranker-v2-m3 (multilingual, ~1.1GB)
 *   - cross-encoder/ms-marco-MiniLM-L-12-v2 (better accuracy, ~170MB)
 *
 * Usage:
 *   Set SQUISH_RERANKER_ENABLED=true
 *   Set SQUISH_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
 */
import type { SearchResult } from '../memory/memories.js';
export interface RerankerConfig {
    enabled: boolean;
    model: string;
    topK: number;
    returnTopK: number;
    device: 'cpu' | 'webgpu';
    dtype: 'q8' | 'q4' | 'f16' | 'f32';
}
export interface RerankedResult {
    id: string;
    originalScore: number;
    rerankScore: number;
    finalScore: number;
    content?: string;
    [key: string]: any;
}
/**
 * Get reranker configuration from environment variables
 * Reads directly from process.env for testability
 */
export declare function getRerankerConfig(): RerankerConfig;
/**
 * Check if reranker is ready
 */
export declare function isReady(): boolean;
/**
 * Score a single query-document pair
 * Returns relevance score (higher = more relevant)
 */
export declare function scorePair(query: string, document: string): Promise<number | null>;
/**
 * Score multiple query-document pairs in batch
 * More efficient than calling scorePair multiple times
 */
export declare function scoreBatch(query: string, documents: string[]): Promise<(number | null)[]>;
/**
 * Rerank search results using cross-encoder
 *
 * @param query - The search query
 * @param results - Initial search results to rerank
 * @param options - Reranking options
 * @returns Reranked results with blended scores
 */
export declare function rerankResults(query: string, results: SearchResult[], options?: {
    topK?: number;
    returnTopK?: number;
    blendWeight?: number;
}): Promise<SearchResult[]>;
/**
 * Check health of the reranker
 */
export declare function checkHealth(): Promise<{
    available: boolean;
    latencyMs?: number;
    error?: string;
    model?: string;
}>;
/**
 * Unload the pipeline (for testing or memory management)
 */
export declare function unload(): Promise<void>;
/**
 * Warm up the model with a test input
 */
export declare function warmup(): Promise<boolean>;
declare const _default: {
    getRerankerConfig: typeof getRerankerConfig;
    isReady: typeof isReady;
    scorePair: typeof scorePair;
    scoreBatch: typeof scoreBatch;
    rerankResults: typeof rerankResults;
    checkHealth: typeof checkHealth;
    unload: typeof unload;
    warmup: typeof warmup;
};
export default _default;
//# sourceMappingURL=cross-encoder-reranker.d.ts.map