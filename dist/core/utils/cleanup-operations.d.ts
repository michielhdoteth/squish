/**
 * Shared Cleanup Operations Utilities
 * Common patterns for age-based cleanup operations
 */
/**
 * Cleanup old session summaries
 */
export declare function cleanupOldSessionSummaries(olderThanDays?: number): Promise<number>;
/**
 * Cleanup old memory snapshots
 */
export declare function cleanupOldMemorySnapshots(olderThanDays?: number): Promise<number>;
//# sourceMappingURL=cleanup-operations.d.ts.map