/**
 * Memory Association Graph (Waypoint Graph)
 * Tracks co-occurrence and relationships between memories
 */
export type AssociationType = 'co_occurred' | 'supersedes' | 'contradicts' | 'supports' | 'relates_to' | 'duplicate' | 'merged' | 'updates' | 'extends' | 'derives';
/**
 * Create or update an association between two memories
 */
/**
 * Confidence tags for associations (inspired by Graphify's tagging system)
 * - EXTRACTED: Found directly from data (co-occurrence, explicit user link)
 * - INFERRED: Reasonable inference (LLM-extracted, entity overlap)
 * - AMBIGUOUS: Uncertain relationship
 */
export type AssociationConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
export declare function createAssociation(fromMemoryId: string, toMemoryId: string, type: AssociationType, weight?: number, confidence?: {
    tag: AssociationConfidence;
    score: number;
}): Promise<void>;
/**
 * Auto-link memories that share entities
 * Called after storing a memory to link it to related memories
 */
export declare function autoLinkByEntities(newMemoryId: string, entityNames: string[], projectId: string): Promise<number>;
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