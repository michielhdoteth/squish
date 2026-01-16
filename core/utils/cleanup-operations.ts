/**
 * Shared Cleanup Operations Utilities
 * Common patterns for age-based cleanup operations
 */

import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

/**
 * Cleanup old session summaries
 */
export async function cleanupOldSessionSummaries(olderThanDays: number = 30): Promise<number> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await (db as any)
      .delete(schema.sessionSummaries)
      .where((schema.sessionSummaries.createdAt as any) < threshold);

    return result?.rowCount || 0;
  } catch (error) {
    console.error('[squish] Error pruning old summaries:', error);
    return 0;
  }
}

/**
 * Cleanup old memory snapshots
 */
export async function cleanupOldMemorySnapshots(olderThanDays: number = 90): Promise<number> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await (db as any)
      .delete(schema.memorySnapshots)
      .where((schema.memorySnapshots.createdAt as any) < threshold);

    return result?.rowCount || 0;
  } catch (error) {
    console.error('[squish] Error deleting old snapshots:', error);
    return 0;
  }
}