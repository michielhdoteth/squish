/**
 * Snapshot Comparison Operations
 * Functions for comparing and diffing snapshots
 */
export interface MemoryDiff {
    added?: string[];
    removed?: string[];
    changed?: Record<string, {
        from: unknown;
        to: unknown;
    }>;
}
export declare function calculateDiff(before: string, after: string): MemoryDiff;
export declare function compareSnapshots(snapshotId1: string, snapshotId2: string): Promise<{
    diff: MemoryDiff;
    contextBefore: string;
    contextAfter: string;
}>;
//# sourceMappingURL=comparison.d.ts.map