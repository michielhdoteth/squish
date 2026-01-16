/**
 * Aggressive Session Summarization
 * Implements incremental, rolling, and final summarization
 */
export type SummaryType = 'incremental' | 'rolling' | 'final';
export interface SummarizationConfig {
    incrementalThreshold: number;
    rollingWindowSize: number;
    compressionRatio: number;
    enabled: boolean;
}
/**
 * Summarize a conversation session
 */
export declare function summarizeSession(conversationId: string, summaryType: SummaryType, customConfig?: Partial<SummarizationConfig>): Promise<{
    summaryId: string;
    tokensSaved: number;
    summary: string;
}>;
/**
 * Get recent summaries for a conversation
 */
export declare function getRecentSummaries(conversationId: string, limit?: number): Promise<any[]>;
/**
 * Get summarization statistics
 */
export declare function getSummarizationStats(projectId?: string): Promise<{
    totalSummaries: number;
    byType: Record<string, number>;
    totalTokensSaved: number;
    avgCompressionRatio: number;
}>;
/**
 * Delete old summaries to save space
 */
export declare function pruneOldSummaries(olderThanDays?: number): Promise<number>;
//# sourceMappingURL=summarization.d.ts.map