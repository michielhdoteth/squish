/**
 * Snapshot Creation Operations
 * Functions for creating different types of memory snapshots
 */
export interface MemoryDiff {
    added?: string[];
    removed?: string[];
    changed?: Record<string, {
        from: unknown;
        to: unknown;
    }>;
}
export declare function createBeforeSnapshot(memoryId: string): Promise<string>;
export declare function createAfterSnapshot(memoryId: string, beforeSnapshotId: string): Promise<{
    snapshotId: string;
    diff: MemoryDiff;
}>;
export declare function createPeriodicSnapshot(memoryId: string): Promise<string>;
//# sourceMappingURL=creation.d.ts.map