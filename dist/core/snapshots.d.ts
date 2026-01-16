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
export declare function getMemoryHistory(memoryId: string, limit?: number): Promise<any[]>;
export declare function getMemorySnapshot(snapshotId: string): Promise<any>;
export declare function deleteOldSnapshots(olderThanDays?: number): Promise<number>;
export declare function compareSnapshots(snapshotId1: string, snapshotId2: string): Promise<{
    diff: MemoryDiff;
    contextBefore: string;
    contextAfter: string;
}>;
export declare function getSnapshotStats(memoryId?: string): Promise<{
    totalSnapshots: number;
    byType: Record<string, number>;
    oldestSnapshot: Date | null;
    newestSnapshot: Date | null;
}>;
//# sourceMappingURL=snapshots.d.ts.map