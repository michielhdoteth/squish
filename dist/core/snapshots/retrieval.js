/**
 * Snapshot Retrieval Operations
 * Functions for retrieving and querying snapshots
 */
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
export async function getMemoryHistory(memoryId, limit = 50) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        return await db
            .select()
            .from(schema.memorySnapshots)
            .where(eq(schema.memorySnapshots.memoryId, memoryId))
            .orderBy(desc(schema.memorySnapshots.createdAt))
            .limit(limit);
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error getting memory history', error);
=======
        console.error('[squish] Error getting memory history:', error);
>>>>>>> pr-3-branch
        return [];
    }
}
export async function getMemorySnapshot(snapshotId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const snapshot = await db
            .select()
            .from(schema.memorySnapshots)
            .where(eq(schema.memorySnapshots.id, snapshotId))
            .limit(1);
        return snapshot.length > 0 ? snapshot[0] : null;
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error getting snapshot', error);
=======
        console.error('[squish] Error getting snapshot:', error);
>>>>>>> pr-3-branch
        return null;
    }
}
//# sourceMappingURL=retrieval.js.map