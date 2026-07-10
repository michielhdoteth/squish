/**
 * Incremental Graph Sync
 *
 * When a new memory is stored, automatically enriches the graph by extracting
 * entities and relations. Runs dedup periodically (not on every write) to
 * keep the graph clean.
 */
export interface SyncOptions {
    project?: string;
    dedupThreshold?: number;
    forceDedup?: boolean;
}
export interface SyncResult {
    memoryId: string;
    entitiesCreated: number;
    relationsCreated: number;
    dedupRan: boolean;
    entitiesDeduplicated?: number;
    source: 'llm' | 'regex' | 'fallback' | 'none';
    durationMs: number;
}
export interface SyncStats {
    totalSynced: number;
    totalEntitiesCreated: number;
    totalRelationsCreated: number;
    totalDedupsRun: number;
    lastSyncAt: string | null;
    entitiesSinceLastDedup: number;
}
/**
 * Hook called after a memory is stored.
 *
 * 1. Adds the memory to the knowledge graph.
 * 2. Tracks entity count; runs dedup when the threshold is exceeded (or when
 *    `forceDedup` is set).
 * 3. Updates project graph stats.
 * 4. Returns sync stats.
 */
export declare function onMemoryStored(memoryId: string, options?: SyncOptions): Promise<SyncResult>;
/**
 * Returns stats about incremental sync activity.
 */
export declare function getSyncStats(projectPath: string): Promise<SyncStats>;
/**
 * Resets the dedup counter for a project.
 * Useful after manual graph operations.
 */
export declare function resetSyncCounter(projectPath: string): void;
//# sourceMappingURL=incremental-sync.d.ts.map