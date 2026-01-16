// Memory Snapshots for Auditability & Diffs
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
export async function createBeforeSnapshot(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0) {
            throw new Error('Memory not found: ' + memoryId);
        }
        const snapshotId = randomUUID();
        await db.insert(schema.memorySnapshots).values({
            id: snapshotId,
            memoryId,
            snapshotType: 'before_update',
            content: memory[0].content,
            metadata: extractMetadata(memory[0]),
            createdAt: new Date(),
        });
        return snapshotId;
    }
    catch (error) {
        console.error('[squish] Error creating before snapshot:', error);
        throw error;
    }
}
export async function createAfterSnapshot(memoryId, beforeSnapshotId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0) {
            throw new Error('Memory not found');
        }
        const before = await db
            .select()
            .from(schema.memorySnapshots)
            .where(eq(schema.memorySnapshots.id, beforeSnapshotId))
            .limit(1);
        if (before.length === 0) {
            throw new Error('Before snapshot not found');
        }
        const diff = calculateDiff(before[0].content, memory[0].content);
        const snapshotId = randomUUID();
        await db.insert(schema.memorySnapshots).values({
            id: snapshotId,
            memoryId,
            snapshotType: 'after_update',
            content: memory[0].content,
            metadata: extractMetadata(memory[0]),
            diff,
            createdAt: new Date(),
        });
        return { snapshotId, diff };
    }
    catch (error) {
        console.error('[squish] Error creating after snapshot:', error);
        throw error;
    }
}
export async function createPeriodicSnapshot(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0) {
            throw new Error('Memory not found');
        }
        const snapshotId = randomUUID();
        await db.insert(schema.memorySnapshots).values({
            id: snapshotId,
            memoryId,
            snapshotType: 'periodic',
            content: memory[0].content,
            metadata: extractMetadata(memory[0]),
            createdAt: new Date(),
        });
        return snapshotId;
    }
    catch (error) {
        console.error('[squish] Error creating periodic snapshot:', error);
        throw error;
    }
}
export async function getMemoryHistory(memoryId, limit = 50) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        return await db
            .select()
            .from(schema.memorySnapshots)
            .where(eq(schema.memorySnapshots.memoryId, memoryId))
            .orderBy(desc(schema.memorySnapshots.createdAt))
            .limit(limit);
    }
    catch (error) {
        console.error('[squish] Error getting memory history:', error);
        return [];
    }
}
export async function getMemorySnapshot(snapshotId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const snapshot = await db
            .select()
            .from(schema.memorySnapshots)
            .where(eq(schema.memorySnapshots.id, snapshotId))
            .limit(1);
        return snapshot.length > 0 ? snapshot[0] : null;
    }
    catch (error) {
        console.error('[squish] Error getting snapshot:', error);
        return null;
    }
}
export async function deleteOldSnapshots(olderThanDays = 90) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const result = await db
            .delete(schema.memorySnapshots)
            .where(schema.memorySnapshots.createdAt < threshold);
        return result?.rowCount || 0;
    }
    catch (error) {
        console.error('[squish] Error deleting old snapshots:', error);
        return 0;
    }
}
function extractMetadata(memory) {
    return {
        type: memory.type,
        sector: memory.sector,
        confidence: memory.confidence,
        relevanceScore: memory.relevanceScore,
        tags: memory.tags,
        agentId: memory.agentId,
    };
}
function calculateDiff(before, after) {
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
export async function compareSnapshots(snapshotId1, snapshotId2) {
    try {
        const snap1 = await getMemorySnapshot(snapshotId1);
        const snap2 = await getMemorySnapshot(snapshotId2);
        if (!snap1 || !snap2) {
            throw new Error('One or both snapshots not found');
        }
        return {
            diff: calculateDiff(snap1.content, snap2.content),
            contextBefore: snap1.content.substring(0, 200),
            contextAfter: snap2.content.substring(0, 200),
        };
    }
    catch (error) {
        console.error('[squish] Error comparing snapshots:', error);
        throw error;
    }
}
export async function getSnapshotStats(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const where = memoryId ? eq(schema.memorySnapshots.memoryId, memoryId) : undefined;
        const snapshots = await db
            .select()
            .from(schema.memorySnapshots)
            .where(where);
        const stats = {
            totalSnapshots: snapshots.length,
            byType: {
                before_update: 0,
                after_update: 0,
                periodic: 0,
            },
            oldestSnapshot: null,
            newestSnapshot: null,
        };
        let oldest = null;
        let newest = null;
        for (const snap of snapshots) {
            stats.byType[snap.snapshotType]++;
            const date = new Date(snap.createdAt);
            if (!oldest || date < oldest)
                oldest = date;
            if (!newest || date > newest)
                newest = date;
        }
        stats.oldestSnapshot = oldest;
        stats.newestSnapshot = newest;
        return stats;
    }
    catch (error) {
        console.error('[squish] Error getting snapshot stats:', error);
        return {
            totalSnapshots: 0,
            byType: {},
            oldestSnapshot: null,
            newestSnapshot: null,
        };
    }
}
//# sourceMappingURL=snapshots.js.map