import type { ExtractedBelief, StoredBelief } from './types.js';
export declare function upsertBeliefsForMemory(input: {
    projectId: string;
    memoryId: string;
    beliefs: ExtractedBelief[];
}): Promise<StoredBelief[]>;
export declare function getBeliefsForMemory(memoryId: string): Promise<StoredBelief[]>;
/**
 * Get all beliefs for a project
 */
export declare function getAllBeliefs(projectId: string, options?: {
    type?: string;
    status?: string;
    minConfidence?: number;
    limit?: number;
}): Promise<StoredBelief[]>;
/**
 * Search beliefs by statement content
 */
export declare function searchBeliefs(projectId: string, query: string, options?: {
    type?: string;
    minConfidence?: number;
    limit?: number;
}): Promise<StoredBelief[]>;
/**
 * Get active constraint beliefs for session boot
 * Returns beliefs that should shape next actions
 */
export declare function getActiveConstraints(projectId: string): Promise<StoredBelief[]>;
/**
 * Get active decision beliefs for session boot
 * Returns decisions that should guide next actions
 */
export declare function getActiveDecisions(projectId: string): Promise<StoredBelief[]>;
/**
 * Get recent failure beliefs for session boot
 * Returns failure_cause beliefs to avoid repeating mistakes
 * @param count - Number of recent failures to return (default 10)
 */
export declare function getRecentFailures(projectId: string, count?: number): Promise<StoredBelief[]>;
/**
 * Get beliefs relevant to a task/query for session boot
 * Used to inject relevant beliefs at session start
 */
export declare function getRelevantBeliefs(projectId: string, taskQuery: string, limit?: number): Promise<StoredBelief[]>;
//# sourceMappingURL=store.d.ts.map