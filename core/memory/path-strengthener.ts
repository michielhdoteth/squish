/**
 * Path Strengthener
 * 
 * Strengthens association paths that led to successful retrievals and
 * weakens paths that led to irrelevant results. This implements the
 * "optimize" concept: the graph develops its own sense of relevance
 * over time based on actual usage patterns.
 * 
 * A customer support agent's graph naturally strengthens paths through
 * product docs and refund policies while letting rarely-queried HR
 * edges decay.
 */

import { eq, and, or, sql, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';

export interface PathStrengthResult {
  strengthened: number;
  weakened: number;
  pruned: number;
}

/**
 * Strengthen the association path between memories that were
 * retrieved together and found useful.
 */
export async function strengthenPath(
  memoryIds: string[],
  boostAmount: number = 2
): Promise<number> {
  if (memoryIds.length < 2) return 0;

  const db = await getDb();
  const schema = await getSchema();
  let strengthened = 0;

  // Generate all pairs
  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      try {
        // Check if association exists
        const existing = await (db as any)
          .select()
          .from(schema.memoryAssociations)
          .where(
            or(
              and(
                eq(schema.memoryAssociations.fromMemoryId, memoryIds[i]),
                eq(schema.memoryAssociations.toMemoryId, memoryIds[j])
              ),
              and(
                eq(schema.memoryAssociations.fromMemoryId, memoryIds[j]),
                eq(schema.memoryAssociations.toMemoryId, memoryIds[i])
              )
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Strengthen existing association
          await (db as any)
            .update(schema.memoryAssociations)
            .set({
              weight: sql`${schema.memoryAssociations.weight} + ${boostAmount}`,
              coactivationCount: sql`${schema.memoryAssociations.coactivationCount} + 1`,
              lastCoactivatedAt: new Date(),
            })
            .where(eq(schema.memoryAssociations.id, existing[0].id));
        } else {
          // Create new association
          await (db as any).insert(schema.memoryAssociations).values({
            fromMemoryId: memoryIds[i],
            toMemoryId: memoryIds[j],
            associationType: 'co_occurred',
            weight: boostAmount,
            coactivationCount: 1,
            lastCoactivatedAt: new Date(),
          });
        }

        strengthened++;
      } catch (error) {
        logger.debug('Error strengthening path', {
          from: memoryIds[i],
          to: memoryIds[j],
          error: error as Error,
        });
      }
    }
  }

  return strengthened;
}

/**
 * Weaken association paths that led to irrelevant results.
 */
export async function weakenPath(
  memoryIds: string[],
  decayAmount: number = 0.5
): Promise<number> {
  if (memoryIds.length < 2) return 0;

  const db = await getDb();
  const schema = await getSchema();
  let weakened = 0;

  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      try {
        const existing = await (db as any)
          .select()
          .from(schema.memoryAssociations)
          .where(
            or(
              and(
                eq(schema.memoryAssociations.fromMemoryId, memoryIds[i]),
                eq(schema.memoryAssociations.toMemoryId, memoryIds[j])
              ),
              and(
                eq(schema.memoryAssociations.fromMemoryId, memoryIds[j]),
                eq(schema.memoryAssociations.toMemoryId, memoryIds[i])
              )
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Weaken but don't remove (minimum weight of 1)
          await (db as any)
            .update(schema.memoryAssociations)
            .set({
              weight: sql`GREATEST(${schema.memoryAssociations.weight} - ${decayAmount}, 1)`,
            })
            .where(eq(schema.memoryAssociations.id, existing[0].id));
          weakened++;
        }
      } catch (error) {
        logger.debug('Error weakening path', {
          from: memoryIds[i],
          to: memoryIds[j],
          error: error as Error,
        });
      }
    }
  }

  return weakened;
}

/**
 * Prune associations that have decayed below a threshold.
 */
export async function pruneWeakAssociations(
  minWeight: number = 2,
  maxAge: number = 90 // days
): Promise<number> {
  const db = await getDb();
  const schema = await getSchema();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);

  try {
    // Delete associations that are weak AND old
    const result = await (db as any)
      .delete(schema.memoryAssociations)
      .where(
        and(
          sql`${schema.memoryAssociations.weight} < ${minWeight}`,
          sql`${schema.memoryAssociations.lastCoactivatedAt} < ${cutoffDate}`
        )
      );

    const pruned = result?.rowCount ?? 0;
    logger.info('Pruned weak associations', { pruned, minWeight, maxAge });
    return pruned;
  } catch (error) {
    logger.error('Error pruning weak associations', { error: error as Error });
    return 0;
  }
}

/**
 * Run a full optimize cycle: strengthen useful paths, weaken unused ones,
 * prune dead associations, and derive implicit facts.
 */
export async function runPruneCycle(
  options?: {
    minWeight?: number;
    maxAge?: number;
  }
): Promise<PathStrengthResult> {
  const { minWeight = 2, maxAge = 90 } = options || {};

  logger.info('Starting prune cycle', { minWeight, maxAge });

  // Step 1: Prune weak associations
  const pruned = await pruneWeakAssociations(minWeight, maxAge);

  logger.info('Prune cycle completed', { pruned });

  return {
    strengthened: 0, // Strengthening happens via retrieval feedback
    weakened: 0,     // Weakening happens via retrieval feedback
    pruned,
  };
}

