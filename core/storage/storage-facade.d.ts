/**
 * Storage Facade
 *
 * Unified API over the triple-layer architecture (relational + vector + graph).
 * Composes existing retrieval, graph, and storage primitives behind a single
 * interface. All individual functions also work directly -- this is optional.
 *
 * Three layers:
 *   1. Relational -- SQL-backed CRUD, filtering, temporal queries
 *   2. Vector -- cosine-similarity semantic search, embeddings
 *   3. Graph -- entity relationship traversal, multi-hop retrieval
 */
import type { RememberInput, SearchInput, SearchResult } from '../memory/memories.js';
import type { MemoryRecord } from '../lib/types.js';
import type { FacadeOptions, RecallOptions, RecallResult, SemanticSearchOptions, SemanticResult } from './types.js';
export type { EntityRecord, EntityRelation, GraphTraversalResult, RecallOptions, RecallResult, FacadeOptions, MemoryFilter, SemanticSearchOptions, SemanticResult, EntityInfo, } from './types.js';
export { getEntities, getEntity, getEntityRelationsByName, getProjectEntityList } from './entity-ops.js';
export { getEntityNeighborhood, traverseGraph, findEntityPaths } from './graph-ops.js';
/** Store a memory. Wraps rememberMemory. */
export declare function storeMemory(input: RememberInput): Promise<MemoryRecord>;
/** Get a single memory by ID (no access-count increment). */
export declare function getMemoryById(id: string): Promise<MemoryRecord | null>;
/** Search memories using hybrid vector+keyword search. */
export declare function queryMemories(input: SearchInput): Promise<SearchResult[]>;
/** Route a query to the optimal retrieval strategy. */
export declare function routeQuery(query: string, options?: {
    projectId?: string;
}): Promise<import("../retrieval/query-router.js").RouteResult>;
/** Extract entity names from a query string. */
export declare function extractEntities(query: string): string[];
/** Boost search results based on entity matches. */
export declare function boostByEntities(results: SearchResult[], queryEntities: string[]): SearchResult[];
/** Enrich content with contextual prefix for better embedding. */
export declare function enrichWith(content: string, options?: {
    type?: string;
    project?: string;
    tags?: string[];
}): import("../retrieval/contextual-enrichment.js").EnrichedContent;
/**
 * High-level recall that routes queries to the optimal strategy.
 * This is the main entry point for retrieval.
 */
export declare function recall(query: string, options?: RecallOptions): Promise<RecallResult>;
/**
 * Create a StorageFacade instance with bound options.
 * All functions are also exported individually for direct use.
 */
export declare function createStorageFacade(options?: FacadeOptions): {
    storeMemory: typeof storeMemory;
    getMemoryById: typeof getMemoryById;
    queryMemories: typeof queryMemories;
    searchSemantic(query: string, opts?: SemanticSearchOptions): Promise<SemanticResult[]>;
    getEntity: (name: string, projectId: string) => Promise<{
        entity: import("./types.js").EntityRecord | null;
        relations: import("./types.js").EntityRelation[];
        mentionCount: number;
    }>;
    traverseGraph: (name: string, projectId: string, opts?: any) => Promise<import("./types.js").GraphTraversalResult>;
    recall: (query: string, opts?: RecallOptions) => Promise<RecallResult>;
    routeQuery: typeof routeQuery;
    extractEntities: typeof extractEntities;
    boostByEntities: typeof boostByEntities;
    enrichWith: typeof enrichWith;
};
//# sourceMappingURL=storage-facade.d.ts.map