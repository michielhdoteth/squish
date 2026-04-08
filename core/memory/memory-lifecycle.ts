import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
import { memories } from '../../db/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

/** Promote a memory to a higher tier (hot -> warm -> cold) */
export async function promoteTier(memoryId: string) {
  const db = await getDb();
  // @ts-ignore - drizzle overloads
  const row = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
  const mem = row[0];
  if (!mem) return;
  let newTier = mem.tier;
  if (mem.tier === 'warm') newTier = 'hot';
  else if (mem.tier === 'cold') newTier = 'warm';
  // @ts-ignore
  await db.update(memories).set({ tier: newTier }).where(eq(memories.id, memoryId));
}

/** Demote a memory tier or expire it based on decay */
export async function demoteTier(memoryId: string) {
  const db = await getDb();
  // @ts-ignore
  const row = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
  const mem = row[0];
  if (!mem) return;
  let updates: any = {};
  if (mem.tier === 'hot') updates.tier = 'warm';
  else if (mem.tier === 'warm') updates.tier = 'cold';
  else updates.status = 'expired';
  // @ts-ignore
  await db.update(memories).set(updates).where(eq(memories.id, memoryId));
}

export async function expireMemory(memoryId: string) {
  const db = await getDb();
  // @ts-ignore
  await db.update(memories).set({ status: 'expired' }).where(eq(memories.id, memoryId));
}

export async function markMerged(memoryId: string, targetId: string) {
  const db = await getDb();
  // @ts-ignore
  await db.update(memories).set({ is_merged: true, merged_into_id: targetId }).where(eq(memories.id, memoryId));
}

export async function markSuperseded(memoryId: string) {
  const db = await getDb();
  // @ts-ignore
  await db.update(memories).set({ is_merged: true }).where(eq(memories.id, memoryId));
}

logger.info('Memory lifecycle helpers loaded');
