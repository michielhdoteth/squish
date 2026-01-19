/**
 * Shared Summarization Strategy Utilities
 * Common patterns for different summarization approaches
 */
/**
 * Chunk messages for incremental summarization
 */
export function chunkMessages(messages, chunkSize) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
        chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
}
/**
 * Get rolling window of messages
 */
export function getRollingWindow(messages, windowSize) {
    return messages.slice(-windowSize);
}
/**
 * Estimate tokens in text (rough approximation)
 */
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Calculate tokens saved by summarization
 */
export function calculateTokensSaved(messages, summary) {
    const originalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
    const summaryTokens = estimateTokens(summary);
    return Math.max(0, originalTokens - summaryTokens);
}
//# sourceMappingURL=summarization-helpers.js.map