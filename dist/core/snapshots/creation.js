/**
 * Snapshot Creation Operations
 * Functions for creating different types of memory snapshots
 */
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
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
<<<<<<< HEAD
        logger.error('Error creating before snapshot', error);
=======
        console.error('[squish] Error creating before snapshot:', error);
>>>>>>> pr-3-branch
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
<<<<<<< HEAD
        logger.error('Error creating after snapshot', error);
=======
        console.error('[squish] Error creating after snapshot:', error);
>>>>>>> pr-3-branch
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
<<<<<<< HEAD
        logger.error('Error creating periodic snapshot', error);
=======
        console.error('[squish] Error creating periodic snapshot:', error);
>>>>>>> pr-3-branch
        throw error;
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
//# sourceMappingURL=creation.js.map