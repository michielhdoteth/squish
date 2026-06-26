/**
 * Memory Tier Classification System - Phase 7
 *
 * Intelligent memory tier system based on access patterns and metadata:
 * - Sturdy: Pinned or frequently accessed, never decays
 * - Long-term: Old, important, recently accessed, slow decay
 * - Working: Recent or young memories, normal behavior
 * - Fleeting: Low importance, old, no recent access, fast decay
 */
export type MemoryTier = 'sturdy' | 'long-term' | 'working' | 'fleeting';
export interface TierCriteria {
    sturdyAccessCount: number;
    sturdyAccessWindow: number;
    longTermAge: number;
    longTermImportance: number;
    fleetingImportance: number;
    fleetingAge: number;
}
/**
 * Classify a memory into a tier based on its access patterns and metadata.
 *
 * Priority order:
 * 1. isPinned OR high access count in window -> sturdy
 * 2. Low importance, old, no recent access -> fleeting
 * 3. Old, recently accessed, important -> long-term
 * 4. Default (young or recently accessed or fallback) -> working
 */
export declare function classifyMemoryTier(memory: {
    isPinned?: boolean;
    importanceScore?: number;
    accessCount?: number;
    lastAccessedAt?: Date | string | number | null;
    createdAt?: Date | string | number | null;
}, criteria?: Partial<TierCriteria>): MemoryTier;
/**
 * Recalculate tiers for all active memories.
 * Optionally filtered by project ID.
 */
export declare function recalculateTiers(projectId?: string): Promise<{
    updated: number;
    tiers: Record<MemoryTier, number>;
}>;
/**
 * Promote a memory to sturdy tier.
 * Sets tier = 'sturdy' AND pins the memory for protection.
 */
export declare function promoteToSturdy(memoryId: string): Promise<boolean>;
/**
 * Get statistics of how many memories are in each tier.
 */
export declare function getTierStats(projectId?: string): Promise<Record<MemoryTier, number>>;
//# sourceMappingURL=tiers.d.ts.map