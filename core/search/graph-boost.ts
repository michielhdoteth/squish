import { getDb } from '../../db/index.js';
import { memoryAssociations } from '../../drizzle/schema.js';
import { inArray } from 'drizzle-orm';

/**
 * Compute a simple graph boost for a set of memory IDs.
 * For each memory, sum (weight * coactivationCount) of outgoing associations.
 * Returns a map from memoryId to boost value (default 0).
 */
export async function computeGraphBoost(memoryIds: string[]): Promise<Record<string, number>> {
  const boost: Record<string, number> = {};
  if (memoryIds.length === 0) return boost;
  const db = await getDb();
  // @ts-ignore - drizzle overload
  const rows = await db.select().from(memoryAssociations).where(inArray(memoryAssociations.fromMemoryId, memoryIds));
  for (const row of rows) {
    const from = row.fromMemoryId as string;
    const val = (row.weight ?? 0) * (row.coactivationCount ?? 0);
    boost[from] = (boost[from] ?? 0) + val;
  }
  return boost;
}
