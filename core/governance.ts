/**
 * Memory Governance
 * Implements protection, pinning, and immutability rules
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';

/**
 * Mark a memory as protected (cannot be evicted)
 */
export async function protectMemory(memoryId: string, reason: string): Promise<void> {
  if (!config.governanceEnabled) return;

  try {
    const db = await getDb();
    const schema = await getSchema();

    await (db as any)
      .update(schema.memories)
      .set({
        isProtected: true,
        metadata: { protectionReason: reason, protectedAt: new Date().toISOString() },
      })
      .where(eq(schema.memories.id, memoryId));
  } catch (error) {
    console.error('[squish] Error protecting memory:', error);
  }
}

/**
 * Pin a memory for automatic injection into context
 */
export async function pinMemory(memoryId: string): Promise<void> {
  if (!config.governanceEnabled) return;

  try {
    const db = await getDb();
    const schema = await getSchema();

    await (db as any)
      .update(schema.memories)
      .set({
        isPinned: true,
        metadata: { pinnedAt: new Date().toISOString() },
      })
      .where(eq(schema.memories.id, memoryId));
  } catch (error) {
    console.error('[squish] Error pinning memory:', error);
  }
}

/**
 * Unpin a memory
 */
export async function unpinMemory(memoryId: string): Promise<void> {
  if (!config.governanceEnabled) return;

  try {
    const db = await getDb();
    const schema = await getSchema();

    await (db as any)
      .update(schema.memories)
      .set({ isPinned: false })
      .where(eq(schema.memories.id, memoryId));
  } catch (error) {
    console.error('[squish] Error unpinning memory:', error);
  }
}













/**
 * Get all pinned memories for auto-injection into context
 */
export async function getPinnedMemories(): Promise<any[]> {
  if (!config.governanceEnabled) return [];

  try {
    const db = await getDb();
    const schema = await getSchema();

    return await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.isPinned, true))
      .limit(50);
  } catch (error) {
    console.error('[squish] Error retrieving pinned memories:', error);
    return [];
  }
}
