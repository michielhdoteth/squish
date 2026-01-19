/**
 * Summarization Strategies
 * Implements different summarization algorithms
 */
import { chunkMessages, getRollingWindow, } from '../utils/summarization-helpers.js';
import { extractMessageContent, generateExtractiveSummary } from '../utils/content-extraction.js';
/**
 * Create incremental summary (summary in chunks)
 */
export async function createIncrementalSummary(messages, config) {
    const chunks = chunkMessages(messages, config.incrementalThreshold);
    const summaries = chunks.map(chunk => generateExtractiveSummary(extractMessageContent(chunk)));
    return summaries.join('\n---\n');
}
/**
 * Create rolling summary (last N messages)
 */
export async function createRollingSummary(messages, config) {
    const window = getRollingWindow(messages, config.rollingWindowSize);
    return generateExtractiveSummary(extractMessageContent(window));
}
/**
 * Create final summary (entire conversation)
 */
export async function createFinalSummary(messages, config) {
    return generateExtractiveSummary(extractMessageContent(messages));
}
//# sourceMappingURL=strategies.js.map