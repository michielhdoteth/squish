/**
 * Memory Lifecycle Management
 * Implements sector-based decay, tier classification, and eviction policies
 *
 * Decay Formula: newScore = importanceScore * (1 - decayRate/100)^days
 * - decayRate: per-memory integer (e.g., 30 = 30% decay per decay cycle)
 * - days: days since lastDecayAt
 * - Tier demotion occurs when score drops below decayThreshold
 * - Cold memories below threshold get status = 'expired'
 */

import { and, eq, lt, gte, desc, inArray, gt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { logger } from './logger.js';
import { triggerDecayApplied } from './memory/hooks.js';

/**
 * Default decay intervals by sector (days until decay check)
 * These determine how often memories in each sector are evaluated for decay
 * Can be configured via config.sectorDecayIntervals
 */
const SECTOR_DECAY_INTERVAL_DAYS: Record<string, number> = {
  episodic: config.sectorDecayIntervals?.episodic || 30,
  semantic: config.sectorDecayIntervals?.semantic || 90,
  procedural: config.sectorDecayIntervals?.procedural || 180,
  autobiographical: config.sectorDecayIntervals?.autobiographical || 365,
  working: config.sectorDecayIntervals?.working || 7,
};

/**
 * Default decay rates by memory type (percentage per decay cycle)
 * Used as fallback when memory.decayRate is not set
 */
const DEFAULT_DECAY_RATES: Record<string, number> = {
  observation: 5,
  fact: 3,
  decision: 2,
  context: 4,
  preference: 3,
  note: 5,
  reflection: 2,
};

export interface LifecycleStats {
  decayed: number;
  evicted: number;
  promoted: number;
  expired: number;
}

/**
 * Run full lifecycle maintenance on all memories
 */
export async function runLifecycleMaintenance(projectId?: string): Promise<LifecycleStats> {
  if (!config.lifecycleEnabled) {
    return { decayed: 0, evicted: 0, promoted: 0, expired: 0 };
  }

  const stats: LifecycleStats = {
    decayed: 0,
    evicted: 0,
    promoted: 0,
    expired: 0,
  };

  try {
    await applyDecay(projectId, stats);
    await evictOldMemories(projectId, stats);
  } catch (error) {
    logger.error('Lifecycle maintenance error', error);
  }

  return stats;
}

/**
 * Apply decay to memories using per-memory decay rate formula
 *
 * Formula: newScore = importanceScore * (1 - decayRate/100)^days
 * - Uses per-memory decayRate (stored as integer percentage, e.g., 30 = 30%)
 * - Calculates days since lastDecayAt
 * - Demotes tier when score drops below decayThreshold
 * - Sets status = 'expired' for cold memories below threshold
 */
async function applyDecay(projectId: string | undefined, stats: LifecycleStats): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();
    const now = new Date();
    const decayThreshold = config.decayThreshold || 0.1;

    // Fetch memories that need decay processing (not protected, not expired)
    let whereClause: any;
    const conditions = [
      eq(schema.memories.isProtected, false),
      eq(schema.memories.status as any, 'active'),
    ];

    if (projectId) {
      conditions.push(eq(schema.memories.projectId, projectId));
    }

    whereClause = and(...conditions);

    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause)
      .limit(10000);

    let decayed = 0;
    let expired = 0;
    const expiredIds: string[] = [];

    for (const memory of memories) {
      // Get decay rate for this memory (fallback to type-based default)
      const decayRate = memory.decayRate || DEFAULT_DECAY_RATES[memory.type] || 5;

      // Calculate days since last decay
      const lastDecayAt = memory.lastDecayAt ? new Date(memory.lastDecayAt) : new Date(memory.createdAt);
      const daysSinceDecay = Math.max(0, (now.getTime() - lastDecayAt.getTime()) / (24 * 60 * 60 * 1000));

      // Skip if not enough time has passed for this sector
      const sectorInterval = SECTOR_DECAY_INTERVAL_DAYS[memory.sector] || 30;
      if (daysSinceDecay < sectorInterval) {
        continue;
      }

      // Apply decay formula: newScore = oldScore * (1 - decayRate/100)^days
      const currentScore = memory.importanceScore || memory.relevanceScore || 50;
      const decayMultiplier = Math.pow(1 - decayRate / 100, daysSinceDecay / sectorInterval);
      const newScore = Math.max(0, Math.round(currentScore * decayMultiplier));

      // Check if memory should expire (below threshold)
      const shouldExpire = newScore < (decayThreshold * 100);

      if (shouldExpire) {
        expiredIds.push(memory.id);
        expired++;
        logger.debug('Memory expiring', { id: memory.id, score: newScore });
      } else if (newScore !== currentScore) {
        // Only update if score changed
        await (db as any)
          .update(schema.memories)
          .set({
            importanceScore: newScore,
            relevanceScore: newScore,
            lastDecayAt: now,
            updatedAt: now,
          })
          .where(eq(schema.memories.id, memory.id));
        decayed++;
        
        // Trigger decay applied hook
        try {
          await triggerDecayApplied({
            memoryId: memory.id,
            content: memory.content,
            type: memory.type,
            tags: typeof memory.tags === 'string' ? memory.tags.split(',') : [],
            project: memory.projectId || undefined,
            source: memory.source || undefined,
            tier: memory.tier,
            importance: newScore,
            oldScore: currentScore,
            newScore: newScore,
          });
        } catch (hookError) {
          logger.error('Error triggering decayApplied hook', hookError);
        }
      }
    }

    // Batch expire memories
    if (expiredIds.length > 0) {
      await (db as any)
        .update(schema.memories)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(inArray(schema.memories.id, expiredIds));
    }

    stats.decayed += decayed;
    stats.expired += expired;

    logger.info('Decay applied', { decayed, expired, total: memories.length });
  } catch (error) {
    logger.error('Error applying decay', error);
  }
}

/**
 * Evict old, cold memories with low relevance
 */
async function evictOldMemories(projectId: string | undefined, stats: LifecycleStats): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const evictionThreshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 180 days

    const where = projectId
      ? and(
          eq(schema.memories.projectId, projectId),
          lt(schema.memories.createdAt as any, evictionThreshold),
          eq(schema.memories.isProtected, false),
          eq(schema.memories.isPinned, false),
          lt(schema.memories.relevanceScore as any, 20) // Very low relevance
        )
      : and(
          lt(schema.memories.createdAt as any, evictionThreshold),
          eq(schema.memories.isProtected, false),
          eq(schema.memories.isPinned, false),
          lt(schema.memories.relevanceScore as any, 20)
        );

    const result = await (db as any).delete(schema.memories).where(where);
    stats.evicted = result?.rowCount || 0;
  } catch (error) {
    logger.error('Error evicting memories', error);
  }
}




