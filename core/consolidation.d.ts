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
/**
 * Run all maintenance steps in sequence: dedup -> stale -> consolidate -> inbox.
 * Standard mode (no LLM) by default. LLM auto-detected from config.llmEnabled.
 *
 * Step routing: dedup -> core/algorithms proposals; consolidate -> GAC
 * geometry-aware consolidation. The parallel SimHash engine was removed in
 * Batch 8 after the consolidation bake-off (docs/consolidation-bakeoff.md).
 *
 * This is the unified entry point for `squish clean`.
 *
 * @param options - Optional configuration
 * @returns Aggregated results per step
 */
export declare function runFullMaintenance(options?: FullMaintenanceOptions): Promise<FullMaintenanceResult>;
//# sourceMappingURL=consolidation.d.ts.map
