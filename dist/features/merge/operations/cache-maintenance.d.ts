/**
 * Hash cache maintenance operations
 *
 * Updates and maintains SimHash/MinHash signatures for efficient duplicate detection
 */
/**
 * Update or create hash cache entry for a single memory
 */
export declare function updateMemoryHashCache(memoryId: string): Promise<boolean>;
/**
 * Rebuild hash cache for an entire project
 * Useful for initialization or recovery
 */
export declare function rebuildProjectHashCache(projectId: string): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}>;
/**
 * Check if hash cache entry is stale and needs refresh
 * Entry is stale if content hash doesn't match
 */
export declare function isHashCacheStale(memoryId: string): Promise<boolean>;
/**
 * Clean up hash cache for non-existent memories
 */
export declare function cleanupOrphanedHashCache(projectId: string): Promise<number>;
//# sourceMappingURL=cache-maintenance.d.ts.map