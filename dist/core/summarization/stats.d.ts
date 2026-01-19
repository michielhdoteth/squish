/**
 * Summarization Statistics
 * Analytics and statistics for summarization operations
 */
/**
 * Get summarization statistics
 */
export declare function getSummarizationStats(projectId?: string): Promise<{
    totalSummaries: number;
    byType: Record<string, number>;
    totalTokensSaved: number;
    avgCompressionRatio: number;
}>;
//# sourceMappingURL=stats.d.ts.map