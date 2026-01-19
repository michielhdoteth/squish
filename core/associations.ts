/**
 * Memory Association Graph (Waypoint Graph)
 * Tracks co-occurrence and relationships between memories
 */

import { eq, and, or, desc, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { logger } from './logger.js';

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
    logger.error('Error creating association', error);
  }
}

/**
 * Track co-activation of multiple memories (they were used together)
 * OPTIMIZED: Uses bulk upsert instead of N² individual database operations
 */
export async function trackCoactivation(memoryIds: string[]): Promise<void> {
  if (memoryIds.length < 2) return;

  try {
    const db = await getDb();
    const schema = await getSchema();
    const now = new Date();

    // Generate all pairs
    const pairs: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        pairs.push({ from: memoryIds[i], to: memoryIds[j] });
        pairs.push({ from: memoryIds[j], to: memoryIds[i] }); // Bidirectional
      }
    }

    if (pairs.length === 0) return;

    // Batch check existing associations with single SELECT
    const pairIds = pairs.map(p => ({ from: p.from, to: p.to }));

    // Check which pairs already exist
    const existingPairs = await (db as any)
      .select({ fromId: schema.memoryAssociations.fromMemoryId, toId: schema.memoryAssociations.toMemoryId })
      .from(schema.memoryAssociations)
      .where(
        or(
          ...pairIds.map((p: any) =>
            and(
              eq(schema.memoryAssociations.fromMemoryId, p.from),
              eq(schema.memoryAssociations.toMemoryId, p.to)
            )
          )
        )
      );

    const existingMap = new Set(
      existingPairs.map((p: any) => `${p.fromId}:${p.toId}`)
    );

    // Separate into new pairs and existing pairs
    const newPairs: any[] = [];
    const existingPairsToUpdate: string[] = [];

    for (const pair of pairs) {
      const key = `${pair.from}:${pair.to}`;
      if (existingMap.has(key)) {
        existingPairsToUpdate.push(key);
      } else {
        newPairs.push({
          fromMemoryId: pair.from,
          toMemoryId: pair.to,
          associationType: 'co_occurred',
          weight: 1,
          coactivationCount: 1,
          lastCoactivatedAt: now,
        });
      }
    }

    // Bulk insert new associations
    if (newPairs.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < newPairs.length; i += BATCH_SIZE) {
        const batch = newPairs.slice(i, i + BATCH_SIZE);
        try {
          // For PostgreSQL with ON CONFLICT support
          if ((db as any).insert && (db as any).onConflict) {
            await (db as any)
              .insert(schema.memoryAssociations)
              .values(batch)
              .onConflict({
                target: [schema.memoryAssociations.fromMemoryId, schema.memoryAssociations.toMemoryId],
                set: {
                  weight: sql`${schema.memoryAssociations.weight} + 1`,
                  coactivationCount: sql`${schema.memoryAssociations.coactivationCount} + 1`,
                  lastCoactivatedAt: now,
                },
              })
              .catch(() => {
                // Fallback for SQLite
                return (db as any).insert(schema.memoryAssociations).values(batch);
              });
          } else {
            // Direct insert for SQLite
            await (db as any).insert(schema.memoryAssociations).values(batch);
          }
        } catch (error) {
          logger.error('Error inserting batch of associations', { batchSize: batch.length, error });
        }
      }
    }

    // Bulk update existing associations
    if (existingPairsToUpdate.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < existingPairsToUpdate.length; i += BATCH_SIZE) {
        const batch = existingPairsToUpdate.slice(i, i + BATCH_SIZE);

        // Extract from/to pairs for this batch
        const batchPairs = batch.map(key => {
          const [from, to] = key.split(':');
          return { from, to };
        });

        try {
          for (const pair of batchPairs) {
            await (db as any)
              .update(schema.memoryAssociations)
              .set({
                weight: sql`${schema.memoryAssociations.weight} + 1`,
                coactivationCount: sql`${schema.memoryAssociations.coactivationCount} + 1`,
                lastCoactivatedAt: now,
              })
              .where(
                and(
                  eq(schema.memoryAssociations.fromMemoryId, pair.from),
                  eq(schema.memoryAssociations.toMemoryId, pair.to)
                )
              );
          }
        } catch (error) {
          logger.error('Error updating batch of associations', { batchSize: batch.length, error });
        }
      }
    }

    logger.debug('Coactivation tracked', {
      totalPairs: pairs.length,
      newAssociations: newPairs.length,
      updatedAssociations: existingPairsToUpdate.length,
    });
  } catch (error) {
    logger.error('Error tracking coactivation', error);
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
    logger.error('Error getting related memories', error);
    return [];
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
    logger.error('Error pruning weak associations', error);
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
    logger.error('Error getting association stats', error);
    return {
      totalAssociations: 0,
      byType: {},
      avgWeight: 0,
      maxWeight: 0,
    };
  }
}


