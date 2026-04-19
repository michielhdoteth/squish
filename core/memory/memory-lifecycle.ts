import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
import { memories } from '../../db/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

/** Promote a memory to a higher tier (cold -> hot only, simplified from warm hierarchy) */
export async function promoteTier(memoryId: string) {
  const db = await getDb();
  // @ts-ignore - drizzle overloads
  const row = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
  const mem = row[0];
  if (!mem) return;
  // Simplified: cold -> hot (no warm tier)
  if (mem.tier === 'cold') {
    await db.update(memories).set({ tier: 'hot' }).where(eq(memories.id, memoryId));
  }
}

/** Demote a memory tier or expire it based on decay (simplified: hot -> cold only) */
export async function demoteTier(memoryId: string) {
  const db = await getDb();
  // @ts-ignore
  const row = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
  const mem = row[0];
  if (!mem) return;
  // Simplified: hot -> cold (no warm tier)
  if (mem.tier === 'hot') {
    await db.update(memories).set({ tier: 'cold' }).where(eq(memories.id, memoryId));
  }
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
