/**
 * Summarization Strategies
 * Implements different summarization algorithms
 */

import {
  chunkMessages,
  getRollingWindow,
} from '../utils/summarization-helpers.js';
import { extractMessageContent, generateExtractiveSummary } from '../utils/content-extraction.js';

export type SummaryType = 'incremental' | 'rolling' | 'final';

export interface SummarizationConfig {
  incrementalThreshold: number; // Summarize every N messages
  rollingWindowSize: number; // Rolling summary window
  compressionRatio: number; // Target compression ratio
  enabled: boolean;
}

/**
 * Create incremental summary (summary in chunks)
 */
export async function createIncrementalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  const chunks = chunkMessages(messages, config.incrementalThreshold);
  const summaries = chunks.map(chunk => generateExtractiveSummary(extractMessageContent(chunk)));
  return summaries.join('\n---\n');
}

/**
 * Create rolling summary (last N messages)
 */
export async function createRollingSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  const window = getRollingWindow(messages, config.rollingWindowSize);
  return generateExtractiveSummary(extractMessageContent(window));
}

/**
 * Create final summary (entire conversation)
 */
export async function createFinalSummary(
  messages: any[],
  config: SummarizationConfig
): Promise<string> {
  return generateExtractiveSummary(extractMessageContent(messages));
}