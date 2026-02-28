/**
 * Memory Lifecycle Management
 * Implements sector-based decay, tier classification, and eviction policies
 */

import { and, eq, lt, gte, desc, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { logger } from './logger.js';

const SECTOR_DECAY_RATES: Record<string, number> = {
  episodic: 30,
  semantic: 90,
  procedural: 180,
  autobiographical: 365,
  working: 7,
};

const TIER_THRESHOLDS = {
  hot: { recency: 7, coactivation: 10, salience: 70 },
  warm: { recency: 30, coactivation: 5, salience: 50 },
  cold: { recency: Infinity, coactivation: 0, salience: 0 },
};

export interface LifecycleStats {
  decayed: number;
  evicted: number;
  promoted: number;
  tierChanges: { hot: number; warm: number; cold: number };
}

/**
 * Run full lifecycle maintenance on all memories
 */
export async function runLifecycleMaintenance(projectId?: string): Promise<LifecycleStats> {
  if (!config.lifecycleEnabled) {
    return { decayed: 0, evicted: 0, promoted: 0, tierChanges: { hot: 0, warm: 0, cold: 0 } };
  }

  const stats: LifecycleStats = {
    decayed: 0,
    evicted: 0,
    promoted: 0,
    tierChanges: { hot: 0, warm: 0, cold: 0 },
  };

  try {
    await applyDecay(projectId, stats);
    await updateTiers(projectId, stats);
    await evictOldMemories(projectId, stats);
  } catch (error) {
    logger.error('Lifecycle maintenance error', error);
  }

  return stats;
}

/**
 * Apply decay to memories based on sector
 */
async function applyDecay(projectId: string | undefined, stats: LifecycleStats): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const now = new Date();

    // For each sector, apply decay
    for (const [sector, decayDays] of Object.entries(SECTOR_DECAY_RATES)) {
      const decayThreshold = new Date(now.getTime() - decayDays * 24 * 60 * 60 * 1000);

      // Build where clause
      let where: any;
      if (projectId) {
        where = and(
          eq(schema.memories.sector as any, sector),
          eq(schema.memories.projectId, projectId),
          lt(schema.memories.lastDecayAt as any, decayThreshold),
          eq(schema.memories.isProtected, false)
        );
      } else {
        where = and(
          eq(schema.memories.sector as any, sector),
          lt(schema.memories.lastDecayAt as any, decayThreshold),
          eq(schema.memories.isProtected, false)
        );
      }

      // Decay: reduce relevance score by 10%
      const result = await (db as any).update(schema.memories)
        .set({
          relevanceScore: Math.max(0, (schema.memories.relevanceScore as any) * 0.9),
          lastDecayAt: now,
        })
        .where(where);

      const rowCount = result?.rowCount || 0;
      stats.decayed += rowCount;
    }
  } catch (error) {
    logger.error('Error applying decay', error);
  }
}

/**
 * Update memory tiers based on recency, coactivation, and salience
 * OPTIMIZED: Uses batched updates instead of individual UPDATE queries
 */
async function updateTiers(projectId: string | undefined, stats: LifecycleStats): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const now = new Date();

    // Fetch all memories to classify
    const where = projectId ? eq(schema.memories.projectId, projectId) : undefined;
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(where)
      .limit(10000); // Process larger batches now

    // Calculate tiers in memory
    const tierAssignments = new Map<string, 'hot' | 'warm' | 'cold'>();
    const tierCounts = { hot: 0, warm: 0, cold: 0 };

    for (const memory of memories) {
      const recencyDays = (now.getTime() - new Date(memory.createdAt).getTime()) / (24 * 60 * 60 * 1000);
      const coactivation = memory.coactivationScore || 0;
      const salience = memory.relevanceScore || 50;

      let newTier: 'hot' | 'warm' | 'cold' = 'cold';

      if (
        recencyDays <= TIER_THRESHOLDS.hot.recency &&
        coactivation >= TIER_THRESHOLDS.hot.coactivation &&
        salience >= TIER_THRESHOLDS.hot.salience
      ) {
        newTier = 'hot';
      } else if (
        recencyDays <= TIER_THRESHOLDS.warm.recency &&
        coactivation >= TIER_THRESHOLDS.warm.coactivation &&
        salience >= TIER_THRESHOLDS.warm.salience
      ) {
        newTier = 'warm';
      }

      if (newTier !== memory.tier) {
        tierAssignments.set(memory.id, newTier);
        tierCounts[newTier]++;
      }
    }

    if (tierAssignments.size === 0) return;

    // Group by tier for efficient batched updates
    const hotIds = Array.from(tierAssignments.entries())
      .filter(([_, tier]) => tier === 'hot')
      .map(([id]) => id);
    const warmIds = Array.from(tierAssignments.entries())
      .filter(([_, tier]) => tier === 'warm')
      .map(([id]) => id);
    const coldIds = Array.from(tierAssignments.entries())
      .filter(([_, tier]) => tier === 'cold')
      .map(([id]) => id);

    // Execute batched updates instead of individual queries
    if (hotIds.length > 0) {
      await (db as any)
        .update(schema.memories)
        .set({ tier: 'hot', updatedAt: now })
        .where(inArray(schema.memories.id, hotIds));
    }

    if (warmIds.length > 0) {
      await (db as any)
        .update(schema.memories)
        .set({ tier: 'warm', updatedAt: now })
        .where(inArray(schema.memories.id, warmIds));
    }

    if (coldIds.length > 0) {
      await (db as any)
        .update(schema.memories)
        .set({ tier: 'cold', updatedAt: now })
        .where(inArray(schema.memories.id, coldIds));
    }

    // Update stats
    stats.tierChanges.hot = tierCounts.hot;
    stats.tierChanges.warm = tierCounts.warm;
    stats.tierChanges.cold = tierCounts.cold;

    logger.debug('Tier updates complete', {
      hot: tierCounts.hot,
      warm: tierCounts.warm,
      cold: tierCounts.cold,
    });
  } catch (error) {
    logger.error('Error updating tiers', error);
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
          eq(schema.memories.tier as any, 'cold'),
          lt(schema.memories.relevanceScore as any, 20) // Very low relevance
        )
      : and(
          lt(schema.memories.createdAt as any, evictionThreshold),
          eq(schema.memories.isProtected, false),
          eq(schema.memories.isPinned, false),
          eq(schema.memories.tier as any, 'cold'),
          lt(schema.memories.relevanceScore as any, 20)
        );

    const result = await (db as any).delete(schema.memories).where(where);
    stats.evicted = result?.rowCount || 0;
  } catch (error) {
    logger.error('Error evicting memories', error);
  }
}




