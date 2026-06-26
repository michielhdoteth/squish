/**
 * Multi-Hop Retrieval
 *
 * Combines vector search with graph traversal to answer queries that
 * require following relationships across entities.
 */
import { type SearchResult } from '../memory/hybrid-search.js';
import { type TraversalPath } from './graph-traversal.js';
export interface MultiHopResult extends SearchResult {
    /** How this result was found: 'vector' (direct search) or 'graph' (via traversal) */
    retrievalPath: 'vector' | 'graph' | 'both';
    /** The graph path that led to this result (if found via graph) */
    graphPath?: TraversalPath;
    /** Entities that connected this result to the query */
    connectingEntities?: string[];
    /** Hybrid score for backward compatibility */
    hybridScore?: number;
}
export interface MultiHopSearchOptions {
    /** Search query */
    query: string;
    /** Project path for scoping */
    project?: string;
    /** Maximum number of results */
    limit?: number;
    /** Maximum graph traversal depth */
    maxHops?: number;
    /** Whether to include vector-only results */
    includeVectorResults?: boolean;
    /** Whether to include graph-expanded results */
    includeGraphResults?: boolean;
    /** Minimum graph path weight to include */
    minPathWeight?: number;
    /** Session ID for context */
    sessionId?: string;
}
/**
 * Perform multi-hop search combining vector search with graph traversal.
 */
export declare function multiHopSearch(options: MultiHopSearchOptions): Promise<MultiHopResult[]>;
/** Check if query needs multi-hop graph traversal. */
export declare function needsMultiHop(query: string): boolean;
/**
 * Get a human-readable explanation of how a multi-hop result was found.
 */
export declare function explainRetrievalPath(result: MultiHopResult): string;
export declare const wouldBenefitFromMultiHop: typeof needsMultiHop;
//# sourceMappingURL=multi-hop-retrieval.d.ts.map