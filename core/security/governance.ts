/**
 * Memory Governance
 * Implements protection, pinning, and immutability rules
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { performMemoryOperation } from '../utils/memory-operations.js';
import { logger } from '../logger.js';
import { createDatabaseClient } from '../storage/database.js';

/**
 * Mark a memory as protected (cannot be evicted)
 */
export async function protectMemory(memoryId: string, reason: string): Promise<void> {
  await performMemoryOperation(memoryId, {
    name: 'protecting memory',
    updates: {
      isProtected: true,
      metadata: { protectionReason: reason, protectedAt: new Date().toISOString() },
    },
  });
}

/**
 * Pin a memory for automatic injection into context
 */
export async function pinMemory(memoryId: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  await db
    .update(schema.memories)
    .set({
      isPinned: true,
      importanceScore: 100,
      lastImportanceRecalc: new Date(),
    })
    .where(eq(schema.memories.id, memoryId));
}

/**
 * Unpin a memory
 */
export async function unpinMemory(memoryId: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  await db
    .update(schema.memories)
    .set({
      isPinned: false,
      lastImportanceRecalc: new Date(),
    })
    .where(eq(schema.memories.id, memoryId));
}













/**
 * Get all pinned memories for auto-injection into context
 * Works regardless of governance settings - pinned memories should always be accessible
 */
export async function getPinnedMemories(projectId?: string): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    let query = (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.isPinned, true))
      .limit(50);

    return await query;
  } catch (error) {
    logger.error('Error retrieving pinned memories', error);
    return [];
  }
}

/**
 * Get pinned memories formatted for context injection
 */
export async function getPinnedMemoriesForContext(projectId?: string): Promise<string[]> {
  const pinned = await getPinnedMemories(projectId);
  return pinned.map(m => 
    `[Pinned] ${m.content?.substring(0, 500) || '(no content)'}`
  );
}
