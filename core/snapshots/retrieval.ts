/**
 * Snapshot Retrieval Operations
 * Functions for retrieving and querying snapshots
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

export async function getMemoryHistory(memoryId: string, limit: number = 50): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    return await (db as any)
      .select()
      .from(schema.memorySnapshots)
      .where(eq(schema.memorySnapshots.memoryId, memoryId))
      .orderBy(desc(schema.memorySnapshots.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('[squish] Error getting memory history:', error);
    return [];
  }
}

export async function getMemorySnapshot(snapshotId: string): Promise<any> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const snapshot = await (db as any)
      .select()
      .from(schema.memorySnapshots)
      .where(eq(schema.memorySnapshots.id, snapshotId))
      .limit(1);

    return snapshot.length > 0 ? snapshot[0] : null;
  } catch (error) {
    console.error('[squish] Error getting snapshot:', error);
    return null;
  }
}