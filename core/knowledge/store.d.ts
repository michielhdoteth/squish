/**
 * Unified Knowledge Store
 *
 * CRUD operations for the knowledge table.
 * Handles all knowledge kinds: memories, beliefs, strategies.
 *
 * Also provides knowledge_edges operations for cross-system relationships.
 */
import type { Knowledge, KnowledgeKind, KnowledgeType, KnowledgeStatus, CreateKnowledgeInput, KnowledgeEdge, CreateKnowledgeEdgeInput, EdgeNodeKind, ExtractedBelief, StoredBelief } from './types.js';
/**
 * Ensure the knowledge and knowledge_edges tables exist.
 * Called lazily on first operation.
 */
export declare function ensureKnowledgeTables(): Promise<void>;
/**
 * Insert a new knowledge record.
 */
export declare function createKnowledge(input: CreateKnowledgeInput): Promise<Knowledge>;
/**
 * Get a knowledge record by ID.
 */
export declare function getKnowledgeById(id: string): Promise<Knowledge | null>;
/**
 * Update a knowledge record.
 */
export declare function updateKnowledge(id: string, updates: Partial<CreateKnowledgeInput>): Promise<Knowledge | null>;
/**
 * Delete a knowledge record by ID.
 */
export declare function deleteKnowledge(id: string): Promise<boolean>;
/**
 * Search knowledge by kind, status, and/or content.
 * Supports both vector and text search.
 */
export declare function searchKnowledge(options: {
    projectId?: string;
    kinds?: KnowledgeKind[];
    types?: KnowledgeType[];
    status?: KnowledgeStatus;
    minConfidence?: number;
    contentQuery?: string;
    limit?: number;
    offset?: number;
}): Promise<Knowledge[]>;
/**
 * Get all active knowledge for a project, grouped by kind.
 */
export declare function listKnowledgeByKind(projectId: string, kind: KnowledgeKind, options?: {
    status?: KnowledgeStatus;
    types?: KnowledgeType[];
    limit?: number;
}): Promise<Knowledge[]>;
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
/**
 * Upsert beliefs extracted from a memory into the knowledge table.
 * Creates knowledge records of kind='belief' and links them to the source
 * memory via knowledge_edges.
 */
export declare function upsertBeliefsForMemory(input: {
    projectId?: string;
    memoryId: string;
    beliefs: ExtractedBelief[];
}): Promise<StoredBelief[]>;
/**
 * Get all beliefs linked to a specific memory via knowledge_edges.
 */
export declare function getBeliefsForMemory(memoryId: string): Promise<StoredBelief[]>;
/**
 * Get active constraint beliefs for session boot.
 * Returns beliefs that should shape next actions.
 */
export declare function getActiveConstraints(projectId: string): Promise<StoredBelief[]>;
/**
 * Get active decision beliefs for session boot.
 * Returns decisions that should guide next actions.
 */
export declare function getActiveDecisions(projectId: string): Promise<StoredBelief[]>;
/**
 * Get recent failure beliefs for session boot.
 * Returns failure_cause beliefs to avoid repeating mistakes.
 */
export declare function getRecentFailures(projectId: string, count?: number): Promise<StoredBelief[]>;
/**
 * Search beliefs by content.
 */
export declare function searchBeliefs(projectId: string, query: string, options?: {
    type?: string;
    minConfidence?: number;
    limit?: number;
}): Promise<StoredBelief[]>;
/**
 * Get all beliefs for a project.
 */
export declare function getAllBeliefs(projectId: string, options?: {
    type?: string;
    status?: string;
    minConfidence?: number;
    limit?: number;
}): Promise<StoredBelief[]>;
/**
 * Get beliefs relevant to a task/query for session boot.
 */
export declare function getRelevantBeliefs(projectId: string, taskQuery: string, limit?: number): Promise<StoredBelief[]>;
//# sourceMappingURL=store.d.ts.map