/**
 * Snapshot Statistics
 * Analytics and statistics for snapshot operations
 */
export declare function getSnapshotStats(memoryId?: string): Promise<{
    totalSnapshots: number;
    byType: Record<string, number>;
    oldestSnapshot: Date | null;
    newestSnapshot: Date | null;
}>;
//# sourceMappingURL=stats.d.ts.map