/**
 * Shared Summarization Strategy Utilities
 * Common patterns for different summarization approaches
 */
/**
 * Chunk messages for incremental summarization
 */
export declare function chunkMessages(messages: any[], chunkSize: number): any[][];
/**
 * Get rolling window of messages
 */
export declare function getRollingWindow(messages: any[], windowSize: number): any[];
/**
 * Estimate tokens in text (rough approximation)
 */
export declare function estimateTokens(text: string): number;
/**
 * Calculate tokens saved by summarization
 */
export declare function calculateTokensSaved(messages: any[], summary: string): number;
//# sourceMappingURL=summarization-helpers.d.ts.map