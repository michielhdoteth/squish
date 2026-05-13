/**
 * Shared Summarization Strategy Utilities
 * Common patterns for different summarization approaches
 */

import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { estimateTokens } from '../context/context-window.js';

export { estimateTokens };

/**
 * Chunk messages for incremental summarization
 */
export function chunkMessages(messages: any[], chunkSize: number): any[][] {
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Get rolling window of messages
 */
export function getRollingWindow(messages: any[], windowSize: number): any[] {
  if (windowSize <= 0) {
    return [];
  }

  return messages.slice(-windowSize);
}

/**
 * Calculate tokens saved by summarization
 */
export function calculateTokensSaved(messages: any[], summary: string): number {
  const originalTokens = messages.reduce(
    (sum: number, m: any) => sum + estimateTokens(m.content || ''),
    0
  );
  const summaryTokens = estimateTokens(summary);
  return Math.max(0, originalTokens - summaryTokens);
}
