/**
 * Memory search and similarity operations.
 *
 * Provides the main search entry-point, fallback recency search, and
 * duplicate-detection helper (findSimilarMemories).
 */
import type { SearchInput, SearchResult } from './memory-types.js';
export declare function search(input: SearchInput): Promise<SearchResult[]>;
/**
 * Find similar memories to prevent duplicates
 * Returns memories with similarity >= threshold
 */
export declare function findSimilarMemories(content: string, threshold?: number, limit?: number): Promise<SearchResult[]>;
//# sourceMappingURL=memory-search.d.ts.map