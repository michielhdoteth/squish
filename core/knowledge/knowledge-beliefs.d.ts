/**
 * Knowledge Belief Adapters — bridge the old beliefs/ API to the unified knowledge table.
 *
 * Single responsibility: all belief-specific operations. Consumers (agent-hooks,
 * explain, trust-state) import these instead of the old beliefs/store.js module.
 */
import type { ExtractedBelief, StoredBelief } from './types.js';
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
//# sourceMappingURL=knowledge-beliefs.d.ts.map