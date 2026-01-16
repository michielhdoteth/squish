/**
 * Memory Lifecycle Management
 * Implements sector-based decay, tier classification, and eviction policies
 */
export interface LifecycleStats {
    decayed: number;
    evicted: number;
    promoted: number;
    tierChanges: {
        hot: number;
        warm: number;
        cold: number;
    };
}
/**
 * Run full lifecycle maintenance on all memories
 */
export declare function runLifecycleMaintenance(projectId?: string): Promise<LifecycleStats>;
/**
 * Promote a memory: boost salience and mark as hot
 */
export declare function promoteMemory(memoryId: string): Promise<void>;
/**
 * Get lifecycle statistics for a project
 */
export declare function getLifecycleStats(projectId?: string): Promise<{
    totalMemories: number;
    byTier: {
        hot: number;
        warm: number;
        cold: number;
    };
    bySector: Record<string, number>;
    protected: number;
    pinned: number;
}>;
//# sourceMappingURL=lifecycle.d.ts.map