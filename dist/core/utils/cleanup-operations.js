/**
 * Shared Cleanup Operations Utilities
 * Common patterns for age-based cleanup operations
 */
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
/**
 * Cleanup old session summaries
 */
export async function cleanupOldSessionSummaries(olderThanDays = 30) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const result = await db
            .delete(schema.sessionSummaries)
            .where(schema.sessionSummaries.createdAt < threshold);
        return result?.rowCount || 0;
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error pruning old summaries', error);
=======
        console.error('[squish] Error pruning old summaries:', error);
>>>>>>> pr-3-branch
        return 0;
    }
}
/**
 * Cleanup old memory snapshots
 */
export async function cleanupOldMemorySnapshots(olderThanDays = 90) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const result = await db
            .delete(schema.memorySnapshots)
            .where(schema.memorySnapshots.createdAt < threshold);
        return result?.rowCount || 0;
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error deleting old snapshots', error);
=======
        console.error('[squish] Error deleting old snapshots:', error);
>>>>>>> pr-3-branch
        return 0;
    }
}
//# sourceMappingURL=cleanup-operations.js.map