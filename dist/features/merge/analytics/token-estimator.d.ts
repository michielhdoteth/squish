/**
 * Token estimation for calculating context window savings from merges.
 * Uses simple heuristic: 1 token ≈ 4 characters (can be upgraded to tiktoken for accuracy).
 */
import type { Memory } from '../../../drizzle/schema.js';
import type { MergedMemory } from '../strategies/merge-strategies.js';
export declare function estimateTokensSaved(sources: Memory[], merged: MergedMemory): number;
export declare function calculateProjectTokenSavings(projectId: string): Promise<{
    totalSaved: number;
    mergeCount: number;
    avgSavingsPerMerge: number;
    tokenSavingPercentage: number;
    totalMemoryTokens: number;
}>;
/**
 * Format token counts for display
 *
 * Converts token count to human-readable format with context usage
 */
export declare function formatTokenCount(tokens: number): string;
/**
 * Format savings report
 */
export declare function formatSavingsReport(savings: {
    totalSaved: number;
    mergeCount: number;
    avgSavingsPerMerge: number;
    tokenSavingPercentage: number;
    totalMemoryTokens: number;
}): string;
/**
 * Estimate savings for a proposed merge (preview)
 *
 * Used in merge preview to show user estimated savings
 */
export declare function estimateMergeSavingsPreview(sources: Memory[], merged: MergedMemory): {
    savedTokens: number;
    savedPercentage: number;
};
/**
 * Get token statistics for a set of memories
 */
export declare function getTokenStatistics(memories: Memory[]): {
    total: number;
    min: number;
    max: number;
    average: number;
    median: number;
};
//# sourceMappingURL=token-estimator.d.ts.map