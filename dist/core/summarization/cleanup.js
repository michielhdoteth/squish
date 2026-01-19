/**
 * Summarization Cleanup Operations
 * Maintenance and cleanup for summarization data
 */
import { cleanupOldSessionSummaries } from '../utils/cleanup-operations.js';
/**
 * Delete old summaries to save space
 */
export async function pruneOldSummaries(olderThanDays = 30) {
    return cleanupOldSessionSummaries(olderThanDays);
}
//# sourceMappingURL=cleanup.js.map