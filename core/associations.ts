/**
 * Memory Association Graph (Waypoint Graph)
 * Tracks co-occurrence and relationships between memories
 */

import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';

export type AssociationType = 'co_occurred' | 'supersedes' | 'contradicts' | 'supports' | 'relates_to';

/**
 * Create or update an association between two memories
 */
export async function createAssociation(
  fromMemoryId: string,
  toMemoryId: string,
  type: AssociationType,
  weight: number = 1
): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    // Check if association already exists
    const existing = await (db as any)
      .select()
      .from(schema.memoryAssociations)
      .where(
        and(
          eq(schema.memoryAssociations.fromMemoryId, fromMemoryId),
          eq(schema.memoryAssociations.toMemoryId, toMemoryId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update weight and coactivation count
      await (db as any)
        .update(schema.memoryAssociations)
        .set({
          weight: existing[0].weight + weight,
          coactivationCount: existing[0].coactivationCount + 1,
          lastCoactivatedAt: new Date(),
        })
        .where(eq(schema.memoryAssociations.id, existing[0].id));
    } else {
      // Create new association
      await (db as any).insert(schema.memoryAssociations).values({
        fromMemoryId,
        toMemoryId,
        associationType: type,
        weight,
        coactivationCount: 1,
        lastCoactivatedAt: new Date(),
      });
    }
  } catch (error) {
    console.error('[squish] Error creating association:', error);
  }
}

/**
 * Track co-activation of multiple memories (they were used together)
 */
export async function trackCoactivation(memoryIds: string[]): Promise<void> {
  if (memoryIds.length < 2) return;

  try {
    // Create co_occurred associations between all pairs
    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        await createAssociation(memoryIds[i], memoryIds[j], 'co_occurred', 1);
        // Also create reverse association
        await createAssociation(memoryIds[j], memoryIds[i], 'co_occurred', 1);
      }
    }
  } catch (error) {
    console.error('[squish] Error tracking coactivation:', error);
  }
}

/**
 * Get related memories via the association graph
 */
export async function getRelatedMemories(
  memoryId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    // Get all associated memories, sorted by weight
    const associations = await (db as any)
      .select()
      .from(schema.memoryAssociations)
      .where(
        or(
          eq(schema.memoryAssociations.fromMemoryId, memoryId),
          eq(schema.memoryAssociations.toMemoryId, memoryId)
        )
      )
      .orderBy(desc(schema.memoryAssociations.weight))
      .limit(limit);

    const relatedIds = associations.map((a: any) =>
      a.fromMemoryId === memoryId ? a.toMemoryId : a.fromMemoryId
    );

    if (relatedIds.length === 0) return [];

    // Fetch the actual memories
    return await (db as any)
      .select()
      .from(schema.memories)
      .where(inArray(schema.memories.id, relatedIds));
  } catch (error) {
    console.error('[squish] Error getting related memories:', error);
    return [];
  }
}

/**
 * Get association strength between two memories
 */
export async function getAssociationWeight(
  fromMemoryId: string,
  toMemoryId: string
): Promise<number> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const association = await (db as any)
      .select()
      .from(schema.memoryAssociations)
      .where(
        and(
          eq(schema.memoryAssociations.fromMemoryId, fromMemoryId),
          eq(schema.memoryAssociations.toMemoryId, toMemoryId)
        )
      )
      .limit(1);

    return association.length > 0 ? association[0].weight : 0;
  } catch (error) {
    console.error('[squish] Error getting association weight:', error);
    return 0;
  }
}

/**
 * Prune weak associations (weight < threshold)
 */
export async function pruneWeakAssociations(weightThreshold: number = 5): Promise<number> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const result = await (db as any)
      .delete(schema.memoryAssociations)
      .where(schema.memoryAssociations.weight as any <= weightThreshold);

    return result?.rowCount || 0;
  } catch (error) {
    console.error('[squish] Error pruning weak associations:', error);
    return 0;
  }
}

/**
 * Get association statistics
 */
export async function getAssociationStats(): Promise<{
  totalAssociations: number;
  byType: Record<string, number>;
  avgWeight: number;
  maxWeight: number;
}> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const associations = await (db as any)
      .select()
      .from(schema.memoryAssociations);

    const stats = {
      totalAssociations: associations.length,
      byType: {} as Record<string, number>,
      avgWeight: 0,
      maxWeight: 0,
    };

    let totalWeight = 0;

    for (const assoc of associations) {
      stats.byType[assoc.associationType] = (stats.byType[assoc.associationType] || 0) + 1;
      totalWeight += assoc.weight;
      if (assoc.weight > stats.maxWeight) stats.maxWeight = assoc.weight;
    }

    stats.avgWeight = associations.length > 0 ? totalWeight / associations.length : 0;

    return stats;
  } catch (error) {
    console.error('[squish] Error getting association stats:', error);
    return {
      totalAssociations: 0,
      byType: {},
      avgWeight: 0,
      maxWeight: 0,
    };
  }
}

/**
 * Mark a memory as superseding another
 */
export async function markSupersession(previousMemoryId: string, newMemoryId: string): Promise<void> {
  try {
    await createAssociation(newMemoryId, previousMemoryId, 'supersedes', 100);
  } catch (error) {
    console.error('[squish] Error marking supersession:', error);
  }
}
