/**
 * Graph Traversal Engine
 *
 * BFS/DFS traversal of the entity relationship graph. This is the
 * core capability that enables multi-hop queries like:
 *
 *   "Was Alice's project affected by Tuesday's outage?"
 *
 * Which requires traversing: Alice → works_on → Project Atlas → uses → PostgreSQL → caused → outage
 *
 * Vector search alone can't answer this because the bridge fact
 * ("Project Atlas uses PostgreSQL") mentions neither Alice nor Tuesday.
 */
import type { RelationType } from './llm-entity-extractor.js';
export interface GraphNode {
    id: string;
    name: string;
    type: string;
    description: string | null;
    properties: Record<string, unknown> | null;
}
export interface GraphEdge {
    id: string;
    fromId: string;
    toId: string;
    relationType: RelationType | string;
    weight: number;
    properties: Record<string, unknown> | null;
}
export interface TraversalPath {
    nodes: GraphNode[];
    edges: GraphEdge[];
    totalWeight: number;
    hopCount: number;
}
export interface NeighborhoodResult {
    center: GraphNode;
    nodes: GraphNode[];
    edges: GraphEdge[];
    radius: number;
}
/**
 * BFS traversal from a starting entity, following relationship edges.
 * Returns all reachable entities within maxDepth hops.
 */
export declare function traverse(startEntityId: string, options?: {
    maxDepth?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    direction?: 'outgoing' | 'incoming' | 'both';
    limit?: number;
}): Promise<GraphNode[]>;
/**
 * Find all paths between two entities within a maximum number of hops.
 * Uses BFS with path tracking.
 */
export declare function findPaths(fromEntityId: string, toEntityId: string, options?: {
    maxHops?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    maxPaths?: number;
}): Promise<TraversalPath[]>;
/**
 * Get the neighborhood around an entity - all entities within N hops.
 * Returns both the entities and the edges connecting them.
 */
export declare function getNeighborhood(centerEntityId: string, options?: {
    radius?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    limit?: number;
}): Promise<NeighborhoodResult | null>;
/**
 * Find entities by name (fuzzy matching).
 */
export declare function findEntitiesByName(name: string, projectId: string, options?: {
    limit?: number;
    fuzzy?: boolean;
}): Promise<GraphNode[]>;
//# sourceMappingURL=graph-traversal.d.ts.map