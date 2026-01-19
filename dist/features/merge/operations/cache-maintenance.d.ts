/**
 * Hash cache maintenance - SimHash/MinHash signatures for duplicate detection
 */
export declare function updateCache(memoryId: string): Promise<boolean>;
export declare function rebuildCache(projectId: string): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}>;
export declare function isStale(memoryId: string): Promise<boolean>;
export declare function cleanupOrphaned(projectId: string): Promise<number>;
//# sourceMappingURL=cache-maintenance.d.ts.map