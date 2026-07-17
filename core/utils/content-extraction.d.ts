/**
 * Shared Content Extraction Utilities
 * Common patterns for extracting information from messages
 */
/**
 * Extract key information from conversation messages
 */
export declare function extractMessageContent(messages: any[]): {
    userMessages: any[];
    assistantMessages: any[];
    toolCalls: Set<string>;
    topics: Set<string>;
    timestamp: string;
};
/**
 * Generate basic extractive summary from extracted content
 */
export declare function generateExtractiveSummary(extracted: ReturnType<typeof extractMessageContent>): string;
//# sourceMappingURL=content-extraction.d.ts.map