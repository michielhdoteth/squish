/**
 * Summarization Strategies
 * Implements different summarization algorithms
 */
export type SummaryType = 'incremental' | 'rolling' | 'final';
export interface SummarizationConfig {
    incrementalThreshold: number;
    rollingWindowSize: number;
    compressionRatio: number;
    enabled: boolean;
}
/**
 * Create incremental summary (summary in chunks)
 */
export declare function createIncrementalSummary(messages: any[], config: SummarizationConfig): Promise<string>;
/**
 * Create rolling summary (last N messages)
 */
export declare function createRollingSummary(messages: any[], config: SummarizationConfig): Promise<string>;
/**
 * Create final summary (entire conversation)
 */
export declare function createFinalSummary(messages: any[], config: SummarizationConfig): Promise<string>;
//# sourceMappingURL=strategies.d.ts.map