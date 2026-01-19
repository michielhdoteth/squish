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
//# sourceMappingURL=lifecycle.d.ts.map