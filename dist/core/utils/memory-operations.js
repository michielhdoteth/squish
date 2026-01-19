/**
 * Shared Memory Operations Utilities
 * Common patterns for memory governance operations
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
/**
 * Generic memory operation with governance checks and error handling
 */
export async function performMemoryOperation(memoryId, operation) {
    if (operation.requiresGovernance !== false && !config.governanceEnabled) {
        return;
    }
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set(operation.updates)
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
<<<<<<< HEAD
        logger.error(`Error ${operation.name.toLowerCase()}`, error);
=======
        console.error(`[squish] Error ${operation.name.toLowerCase()}:`, error);
>>>>>>> pr-3-branch
    }
}
/**
 * Redis publish operation with error handling
 */
export async function performRedisPublish(getRedisClient, channel, message) {
    try {
        const redis = await getRedisClient();
        await redis.publish(channel, JSON.stringify(message));
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error publishing to Redis', error);
=======
        console.error('[squish] Error publishing to Redis:', error);
>>>>>>> pr-3-branch
    }
}
//# sourceMappingURL=memory-operations.js.map