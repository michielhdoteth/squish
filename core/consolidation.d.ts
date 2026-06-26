/**
 * Options for unified full maintenance run (Phase 6)
 */
export interface FullMaintenanceOptions {
    projectId?: string;
    dryRun?: boolean;
    steps?: ('dedup' | 'stale' | 'consolidate' | 'inbox')[];
    age?: number;
    llmEnabled?: boolean;
}
/**
 * Result of a unified full maintenance run
 */
export interface FullMaintenanceResult {
    ok: boolean;
    steps: Record<string, {
        ok: boolean;
        count: number;
        error?: string;
    }>;
    dryRun: boolean;
}
export interface ConsolidationStats {
    clustered: number;
    merged: number;
    tokensRecovered: number;
    deduped: number;
    consolidated: number;
    geometrySafeClusters?: number;
    geometrySkippedClusters?: number;
    avgDBar?: number;
    avgDEff?: number;
}
export interface DeduplicationResult {
    duplicatesFound: number;
    mergedCount: number;
    tokensRecovered: number;
    groups: DuplicateGroup[];
}
export interface DuplicateGroup {
    canonicalId: string;
    duplicateIds: string[];
    similarity: number;
    reason: string;
}
/**
 * Run automated deduplication job
 * Finds and marks duplicates for review or auto-merges high-confidence duplicates
 */
export declare function runDeduplicationJob(projectId?: string): Promise<DeduplicationResult>;
/**
 * Compute SimHash for text (64-bit fingerprint)
 * Exported for testing.
 */
export declare function computeSimHash(text: string): bigint;
/**
 * Run full consolidation job (dedup + memory consolidation)
 */
export declare function runFullConsolidationJob(projectId?: string): Promise<ConsolidationStats>;
/**
 * Get deduplication statistics
 */
export declare function getDeduplicationStats(projectId?: string): Promise<{
    totalMemories: number;
    mergedMemories: number;
    pendingDuplicates: number;
}>;
/**
 * Run all maintenance steps in sequence: dedup -> stale -> consolidate -> inbox.
 * Standard mode (no LLM) by default. LLM auto-detected from config.llmEnabled.
 *
 * This is the unified entry point for `squish clean`.
 *
 * @param options - Optional configuration
 * @returns Aggregated results per step
 */
export declare function runFullMaintenance(options?: FullMaintenanceOptions): Promise<FullMaintenanceResult>;
//# sourceMappingURL=consolidation.d.ts.map