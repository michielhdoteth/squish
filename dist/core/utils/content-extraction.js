/**
 * Shared Content Extraction Utilities
 * Common patterns for extracting information from messages
 */
/**
 * Extract key information from conversation messages
 */
export function extractMessageContent(messages) {
    // Extract key information from messages
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    // Extract tool calls
    const toolCalls = new Set();
    for (const msg of messages) {
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            for (const tc of msg.toolCalls) {
                toolCalls.add(tc.name);
            }
        }
    }
    // Extract topics from first and last user messages
    const topics = new Set();
    if (userMessages.length > 0) {
        const firstUser = userMessages[0].content || '';
        const lastUser = userMessages[userMessages.length - 1].content || '';
        // Simple topic extraction (first 10 words)
        const extractTopics = (text) => {
            const words = text.split(/\s+/).slice(0, 10);
            return words.join(' ');
        };
        if (firstUser)
            topics.add(extractTopics(firstUser));
        if (lastUser && lastUser !== firstUser)
            topics.add(extractTopics(lastUser));
    }
    const timestamp = messages.length > 0 ? messages[messages.length - 1].createdAt : 'unknown';
    return {
        userMessages,
        assistantMessages,
        toolCalls,
        topics,
        timestamp,
    };
}
/**
 * Generate basic extractive summary from extracted content
 */
export function generateExtractiveSummary(extracted) {
    const parts = [];
    if (extracted.userMessages.length > 0) {
        parts.push(`User prompts: ${extracted.userMessages.length}`);
    }
    if (extracted.assistantMessages.length > 0) {
        parts.push(`Assistant responses: ${extracted.assistantMessages.length}`);
    }
    if (extracted.toolCalls.size > 0) {
        parts.push(`Tools used: ${Array.from(extracted.toolCalls).join(', ')}`);
    }
    if (extracted.topics.size > 0) {
        parts.push(`Topics: ${Array.from(extracted.topics).join('; ')}`);
    }
    parts.push(`Last activity: ${extracted.timestamp}`);
    return parts.join('. ');
}
//# sourceMappingURL=content-extraction.js.map