/**
 * Summarization Cleanup Operations
 * Maintenance and cleanup for summarization data
 */

import { cleanupOldSessionSummaries } from '../utils/cleanup-operations.js';

/**
 * Delete old summaries to save space
 */
export async function pruneOldSummaries(olderThanDays: number = 30): Promise<number> {
  return cleanupOldSessionSummaries(olderThanDays);
}