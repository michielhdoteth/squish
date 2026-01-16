/**
 * Snapshot Creation Operations
 * Functions for creating different types of memory snapshots
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

export interface MemoryDiff {
  added?: string[];
  removed?: string[];
  changed?: Record<string, { from: unknown; to: unknown }>;
}

export async function createBeforeSnapshot(memoryId: string): Promise<string> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const memory = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) {
      throw new Error('Memory not found: ' + memoryId);
    }

    const snapshotId = randomUUID();

    await (db as any).insert(schema.memorySnapshots).values({
      id: snapshotId,
      memoryId,
      snapshotType: 'before_update',
      content: memory[0].content,
      metadata: extractMetadata(memory[0]),
      createdAt: new Date(),
    });

    return snapshotId;
  } catch (error) {
    console.error('[squish] Error creating before snapshot:', error);
    throw error;
  }
}

export async function createAfterSnapshot(
  memoryId: string,
  beforeSnapshotId: string
): Promise<{ snapshotId: string; diff: MemoryDiff }> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const memory = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) {
      throw new Error('Memory not found');
    }

    const before = await (db as any)
      .select()
      .from(schema.memorySnapshots)
      .where(eq(schema.memorySnapshots.id, beforeSnapshotId))
      .limit(1);

    if (before.length === 0) {
      throw new Error('Before snapshot not found');
    }

    const diff = calculateDiff(before[0].content, memory[0].content);
    const snapshotId = randomUUID();

    await (db as any).insert(schema.memorySnapshots).values({
      id: snapshotId,
      memoryId,
      snapshotType: 'after_update',
      content: memory[0].content,
      metadata: extractMetadata(memory[0]),
      diff,
      createdAt: new Date(),
    });

    return { snapshotId, diff };
  } catch (error) {
    console.error('[squish] Error creating after snapshot:', error);
    throw error;
  }
}

export async function createPeriodicSnapshot(memoryId: string): Promise<string> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const memory = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) {
      throw new Error('Memory not found');
    }

    const snapshotId = randomUUID();

    await (db as any).insert(schema.memorySnapshots).values({
      id: snapshotId,
      memoryId,
      snapshotType: 'periodic',
      content: memory[0].content,
      metadata: extractMetadata(memory[0]),
      createdAt: new Date(),
    });

    return snapshotId;
  } catch (error) {
    console.error('[squish] Error creating periodic snapshot:', error);
    throw error;
  }
}

function extractMetadata(memory: any): Record<string, unknown> {
  return {
    type: memory.type,
    sector: memory.sector,
    confidence: memory.confidence,
    relevanceScore: memory.relevanceScore,
    tags: memory.tags,
    agentId: memory.agentId,
  };
}

function calculateDiff(before: string, after: string): MemoryDiff {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const added = afterLines.filter(line => !beforeSet.has(line));
  const removed = beforeLines.filter(line => !afterSet.has(line));

  return {
    added: added.length > 0 ? added : undefined,
    removed: removed.length > 0 ? removed : undefined,
  };
}