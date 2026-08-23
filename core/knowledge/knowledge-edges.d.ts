/**
 * Knowledge Edges — CRUD and graph traversal for knowledge_edges.
 *
 * Single responsibility: managing relationships between knowledge, entities,
 * and places. Includes cross-entity queries like getConnectedEntities and
 * getConnectedPlaces that traverse the knowledge graph.
 */
import type { Knowledge, KnowledgeEdge, CreateKnowledgeEdgeInput, EdgeNodeKind } from './types.js';
/**
 * Create an edge between two nodes (knowledge, entity, or place).
 * Deduplicates by the unique constraint.
 */
export declare function createKnowledgeEdge(input: CreateKnowledgeEdgeInput): Promise<KnowledgeEdge>;
/**
 * Get all edges from a node (outgoing).
 */
export declare function getEdgesFrom(nodeId: string, nodeKind: EdgeNodeKind, edgeType?: string): Promise<KnowledgeEdge[]>;
/**
 * Get all edges to a node (incoming).
 */
export declare function getEdgesTo(nodeId: string, nodeKind: EdgeNodeKind, edgeType?: string): Promise<KnowledgeEdge[]>;
/**
 * Get all edges connected to a node (both directions).
 */
export declare function getEdgesForNode(nodeId: string, nodeKind: EdgeNodeKind): Promise<KnowledgeEdge[]>;
/**
 * Delete an edge by ID.
 */
export declare function deleteKnowledgeEdge(id: string): Promise<boolean>;
/**
 * Delete all edges from/to a node (used during cleanup).
 */
export declare function deleteEdgesForNode(nodeId: string, nodeKind: EdgeNodeKind): Promise<number>;
/**
 * Get connected entities for a knowledge record.
 *
 * Finds entity IDs linked to this knowledge via knowledge_edges, then returns
 * other knowledge records that also reference those same entities — giving
 * callers a transitive view of the knowledge graph through shared entities.
 */
export declare function getConnectedEntities(knowledgeId: string): Promise<Knowledge[]>;
/**
 * Get connected places for a knowledge record.
 *
 * Finds place IDs linked to this knowledge via knowledge_edges, then returns
 * other knowledge records that share those same places — either via edges
 * or via the knowledge table's place_id / primary_place columns.
 */
export declare function getConnectedPlaces(knowledgeId: string): Promise<Knowledge[]>;
//# sourceMappingURL=knowledge-edges.d.ts.map