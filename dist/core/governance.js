/**
 * Memory Governance
 * Implements protection, pinning, and immutability rules
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
/**
 * Mark a memory as protected (cannot be evicted)
 */
export async function protectMemory(memoryId, reason) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({
            isProtected: true,
            metadata: { protectionReason: reason, protectedAt: new Date().toISOString() },
        })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error protecting memory:', error);
    }
}
/**
 * Pin a memory for automatic injection into context
 */
export async function pinMemory(memoryId) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({
            isPinned: true,
            metadata: { pinnedAt: new Date().toISOString() },
        })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error pinning memory:', error);
    }
}
/**
 * Unpin a memory
 */
export async function unpinMemory(memoryId) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({ isPinned: false })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error unpinning memory:', error);
    }
}
/**
 * Make a memory immutable (cannot be updated)
 */
export async function makeImmutable(memoryId, reason) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({
            isImmutable: true,
            metadata: { immutabilityReason: reason, madeImmutableAt: new Date().toISOString() },
        })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error making memory immutable:', error);
    }
}
/**
 * Check if an actor can modify a memory
 */
export async function canModifyMemory(memoryId, actorId) {
    if (!config.governanceEnabled)
        return true;
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0)
            return false;
        const m = memory[0];
        // Check immutability
        if (m.isImmutable)
            return false;
        // Check write scope
        if (m.writeScope && m.writeScope.length > 0) {
            return m.writeScope.includes(actorId) || m.writeScope.includes('*');
        }
        return true;
    }
    catch (error) {
        console.error('[squish] Error checking modify permission:', error);
        return false;
    }
}
/**
 * Check if an actor can read a memory
 */
export async function canReadMemory(memoryId, actorId) {
    if (!config.governanceEnabled)
        return true;
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0)
            return false;
        const m = memory[0];
        // Private memories only readable by their owner
        if (m.visibilityScope === 'private') {
            return m.agentId === actorId;
        }
        // Check read scope
        if (m.readScope && m.readScope.length > 0) {
            return m.readScope.includes(actorId) || m.readScope.includes('*');
        }
        return true;
    }
    catch (error) {
        console.error('[squish] Error checking read permission:', error);
        return false;
    }
}
/**
 * Set custom write scope for a memory
 */
export async function setWriteScope(memoryId, scope) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({ writeScope: scope })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error setting write scope:', error);
    }
}
/**
 * Set custom read scope for a memory
 */
export async function setReadScope(memoryId, scope) {
    if (!config.governanceEnabled)
        return;
    try {
        const db = await getDb();
        const schema = await getSchema();
        await db
            .update(schema.memories)
            .set({ readScope: scope })
            .where(eq(schema.memories.id, memoryId));
    }
    catch (error) {
        console.error('[squish] Error setting read scope:', error);
    }
}
/**
 * Get governance status of a memory
 */
export async function getGovernanceStatus(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select({
            isProtected: schema.memories.isProtected,
            isPinned: schema.memories.isPinned,
            isImmutable: schema.memories.isImmutable,
            writeScope: schema.memories.writeScope,
            readScope: schema.memories.readScope,
            visibilityScope: schema.memories.visibilityScope,
        })
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0) {
            return {
                isProtected: false,
                isPinned: false,
                isImmutable: false,
            };
        }
        return memory[0];
    }
    catch (error) {
        console.error('[squish] Error getting governance status:', error);
        return {
            isProtected: false,
            isPinned: false,
            isImmutable: false,
        };
    }
}
/**
 * Get all pinned memories for auto-injection into context
 */
export async function getPinnedMemories() {
    if (!config.governanceEnabled)
        return [];
    try {
        const db = await getDb();
        const schema = await getSchema();
        return await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.isPinned, true))
            .limit(50);
    }
    catch (error) {
        console.error('[squish] Error retrieving pinned memories:', error);
        return [];
    }
}
//# sourceMappingURL=governance.js.map