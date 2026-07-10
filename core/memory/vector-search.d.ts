/**
 * Vector Search - Pure semantic search with cosine similarity on embeddings
 */
import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../storage/database.js';
/**
 * Cached DB context for a single search operation.
 * Avoids redundant getDb()/createDatabaseClient() calls across
 * vectorSearch, keywordSearch, and helper functions.
 */
export interface SearchDbContext {
    dbClient: ReturnType<typeof createDatabaseClient>;
    /** Raw drizzle DB instance for direct query builder usage */
    db: Awaited<ReturnType<typeof getDb>>;
}
type HybridSearchOptions = {
    limit?: number;
    project?: string;
    type?: string;
    tags?: string[];
};
export declare function vectorSearch(input: SearchInput, options: HybridSearchOptions, precomputedEmbedding?: number[] | null, ctx?: SearchDbContext): Promise<SearchResult[]>;
export {};
//# sourceMappingURL=vector-search.d.ts.map