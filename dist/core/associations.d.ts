/**
 * Memory Association Graph (Waypoint Graph)
 * Tracks co-occurrence and relationships between memories
 */
export type AssociationType = 'co_occurred' | 'supersedes' | 'contradicts' | 'supports' | 'relates_to';
/**
 * Create or update an association between two memories
 */
export declare function createAssociation(fromMemoryId: string, toMemoryId: string, type: AssociationType, weight?: number): Promise<void>;
/**
 * Track co-activation of multiple memories (they were used together)
 */
export declare function trackCoactivation(memoryIds: string[]): Promise<void>;
/**
 * Get related memories via the association graph
 */
export declare function getRelatedMemories(memoryId: string, limit?: number): Promise<any[]>;
/**
 * Prune weak associations (weight < threshold)
 */
export declare function pruneWeakAssociations(weightThreshold?: number): Promise<number>;
/**
 * Get association statistics
 */
export declare function getAssociationStats(): Promise<{
    totalAssociations: number;
    byType: Record<string, number>;
    avgWeight: number;
    maxWeight: number;
}>;
//# sourceMappingURL=associations.d.ts.map