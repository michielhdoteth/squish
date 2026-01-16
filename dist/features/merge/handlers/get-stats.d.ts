/**
 * MCP Tool: get_merge_stats
 *
 * Returns statistics about memory merges for a project
 */
interface GetMergeStatsInput {
    projectId: string;
}
interface MergeStats {
    projectId: string;
    totalMemories: number;
    mergeableMemories: number;
    mergedMemories: number;
    canonicalMemories: number;
    pendingProposals: number;
    approvedMerges: number;
    rejectedProposals: number;
    tokensSaved: {
        total: number;
        formatted: string;
        percentage: number;
    };
    averageMergeSize: number;
    reversedMerges: number;
}
interface GetMergeStatsResponse {
    ok: boolean;
    message: string;
    data?: MergeStats;
    error?: string;
}
/**
 * Handle get_merge_stats tool call
 *
 * Gathers merge statistics for a project
 */
export declare function handleGetMergeStats(input: GetMergeStatsInput): Promise<GetMergeStatsResponse>;
export {};
//# sourceMappingURL=get-stats.d.ts.map