/**
 * Memory Lifecycle Management
 * Implements sector-based decay, tier classification, and eviction policies
 */
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
// Sector decay rates (days until decay)
const SECTOR_DECAY_RATES = {
    episodic: 30, // Recent events, fast decay
    semantic: 90, // Facts, slower decay
    procedural: 180, // How-to knowledge, very slow decay
    autobiographical: 365, // Personal history, slowest decay
    working: 7, // Temporary context, very fast decay
};
// Tier thresholds (based on recency, coactivation, salience)
const TIER_THRESHOLDS = {
    hot: { recency: 7, coactivation: 10, salience: 70 },
    warm: { recency: 30, coactivation: 5, salience: 50 },
    cold: { recency: Infinity, coactivation: 0, salience: 0 },
};
/**
 * Run full lifecycle maintenance on all memories
 */
export async function runLifecycleMaintenance(projectId) {
    if (!config.lifecycleEnabled) {
        return { decayed: 0, evicted: 0, promoted: 0, tierChanges: { hot: 0, warm: 0, cold: 0 } };
    }
    const stats = {
        decayed: 0,
        evicted: 0,
        promoted: 0,
        tierChanges: { hot: 0, warm: 0, cold: 0 },
    };
    try {
        await applyDecay(projectId, stats);
        await updateTiers(projectId, stats);
        await evictOldMemories(projectId, stats);
    }
    catch (error) {
        console.error('[squish] Lifecycle maintenance error:', error);
    }
    return stats;
}
/**
 * Apply decay to memories based on sector
 */
async function applyDecay(projectId, stats) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const now = new Date();
        // For each sector, apply decay
        for (const [sector, decayDays] of Object.entries(SECTOR_DECAY_RATES)) {
            const decayThreshold = new Date(now.getTime() - decayDays * 24 * 60 * 60 * 1000);
            // Build where clause
            let where;
            if (projectId) {
                where = and(eq(schema.memories.sector, sector), eq(schema.memories.projectId, projectId), lt(schema.memories.lastDecayAt, decayThreshold), eq(schema.memories.isProtected, false));
            }
            else {
                where = and(eq(schema.memories.sector, sector), lt(schema.memories.lastDecayAt, decayThreshold), eq(schema.memories.isProtected, false));
            }
            // Decay: reduce relevance score by 10%
            const result = await db.update(schema.memories)
                .set({
                relevanceScore: Math.max(0, schema.memories.relevanceScore * 0.9),
                lastDecayAt: now,
            })
                .where(where);
            const rowCount = result?.rowCount || 0;
            stats.decayed += rowCount;
        }
    }
    catch (error) {
        console.error('[squish] Error applying decay:', error);
    }
}
/**
 * Update memory tiers based on recency, coactivation, and salience
 */
async function updateTiers(projectId, stats) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const now = new Date();
        // Fetch all memories to classify
        const where = projectId ? eq(schema.memories.projectId, projectId) : undefined;
        const memories = await db
            .select()
            .from(schema.memories)
            .where(where)
            .limit(1000); // Process in batches
        for (const memory of memories) {
            const recencyDays = (now.getTime() - new Date(memory.createdAt).getTime()) / (24 * 60 * 60 * 1000);
            const coactivation = memory.coactivationScore || 0;
            const salience = memory.relevanceScore || 50;
            let newTier = 'cold';
            if (recencyDays <= TIER_THRESHOLDS.hot.recency &&
                coactivation >= TIER_THRESHOLDS.hot.coactivation &&
                salience >= TIER_THRESHOLDS.hot.salience) {
                newTier = 'hot';
            }
            else if (recencyDays <= TIER_THRESHOLDS.warm.recency &&
                coactivation >= TIER_THRESHOLDS.warm.coactivation &&
                salience >= TIER_THRESHOLDS.warm.salience) {
                newTier = 'warm';
            }
            if (newTier !== memory.tier) {
                await db
                    .update(schema.memories)
                    .set({ tier: newTier })
                    .where(eq(schema.memories.id, memory.id));
                stats.tierChanges[newTier]++;
            }
        }
    }
    catch (error) {
        console.error('[squish] Error updating tiers:', error);
    }
}
/**
 * Evict old, cold memories with low relevance
 */
async function evictOldMemories(projectId, stats) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const evictionThreshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 180 days
        const where = projectId
            ? and(eq(schema.memories.projectId, projectId), lt(schema.memories.createdAt, evictionThreshold), eq(schema.memories.isProtected, false), eq(schema.memories.isPinned, false), eq(schema.memories.tier, 'cold'), lt(schema.memories.relevanceScore, 20) // Very low relevance
            )
            : and(lt(schema.memories.createdAt, evictionThreshold), eq(schema.memories.isProtected, false), eq(schema.memories.isPinned, false), eq(schema.memories.tier, 'cold'), lt(schema.memories.relevanceScore, 20));
        const result = await db.delete(schema.memories).where(where);
        stats.evicted = result?.rowCount || 0;
    }
    catch (error) {
        console.error('[squish] Error evicting memories:', error);
    }
}
/**
 * Promote a memory: boost salience and mark as hot
 */
export async function promoteMemory(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({
            promotionCount: schema.memories.promotionCount + 1,
            relevanceScore: Math.min(100, schema.memories.relevanceScore + 10),
            tier: 'hot',
        })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error promoting memory:', error);
    }
}
/**
 * Get lifecycle statistics for a project
 */
export async function getLifecycleStats(projectId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const where = projectId ? eq(schema.memories.projectId, projectId) : undefined;
        const memories = await db
            .select({
            id: schema.memories.id,
            tier: schema.memories.tier,
            sector: schema.memories.sector,
            isProtected: schema.memories.isProtected,
            isPinned: schema.memories.isPinned,
        })
            .from(schema.memories)
            .where(where);
        const stats = {
            totalMemories: memories.length,
            byTier: { hot: 0, warm: 0, cold: 0 },
            bySector: {},
            protected: 0,
            pinned: 0,
        };
        for (const mem of memories) {
            stats.byTier[mem.tier]++;
            stats.bySector[mem.sector] = (stats.bySector[mem.sector] || 0) + 1;
            if (mem.isProtected)
                stats.protected++;
            if (mem.isPinned)
                stats.pinned++;
        }
        return stats;
    }
    catch (error) {
        console.error('[squish] Error getting lifecycle stats:', error);
        return {
            totalMemories: 0,
            byTier: { hot: 0, warm: 0, cold: 0 },
            bySector: {},
            protected: 0,
            pinned: 0,
        };
    }
}
//# sourceMappingURL=lifecycle.js.map