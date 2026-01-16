/**
 * Shared Memory Operations Utilities
 * Common patterns for memory governance operations
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';

/**
 * Generic memory operation with governance checks and error handling
 */
export async function performMemoryOperation(
  memoryId: string,
  operation: {
    name: string;
    updates: Record<string, any>;
    requiresGovernance?: boolean;
  }
): Promise<void> {
  if (operation.requiresGovernance !== false && !config.governanceEnabled) {
    return;
  }

  try {
    const db = await getDb();
    const schema = await getSchema();

    await (db as any)
      .update(schema.memories)
      .set(operation.updates)
      .where(eq(schema.memories.id, memoryId));
  } catch (error) {
    console.error(`[squish] Error ${operation.name.toLowerCase()}:`, error);
  }
}

/**
 * Redis publish operation with error handling
 */
export async function performRedisPublish(
  getRedisClient: () => Promise<any>,
  channel: string,
  message: unknown
): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.publish(channel, JSON.stringify(message));
  } catch (error) {
    console.error('[squish] Error publishing to Redis:', error);
  }
}