/**
 * Graph Operations
 *
 * Traversal, neighborhood, and path-finding via the storage layer.
 */
import type { RelationType } from '../graph/llm-entity-extractor.js';
import type { GraphTraversalResult } from './types.js';
import type { NeighborhoodResult, TraversalPath } from '../graph/graph-traversal.js';
/**
 * Get the neighborhood around an entity -- all entities within N hops.
 */
export declare function getEntityNeighborhood(entityName: string, projectId: string, options?: {
    radius?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    limit?: number;
}): Promise<NeighborhoodResult | null>;
/**
 * Traverse the graph from an entity name.
 */
export declare function traverseGraph(entityName: string, projectId: string, options?: {
    maxDepth?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    direction?: 'outgoing' | 'incoming' | 'both';
    limit?: number;
}): Promise<GraphTraversalResult>;
/**
 * Find all paths between two entity names.
 */
export declare function findEntityPaths(fromName: string, toName: string, projectId: string, options?: {
    maxHops?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    maxPaths?: number;
}): Promise<TraversalPath[]>;
//# sourceMappingURL=graph-ops.d.ts.map