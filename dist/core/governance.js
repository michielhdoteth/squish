/**
 * Memory Governance
 * Implements protection, pinning, and immutability rules
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { performMemoryOperation } from './utils/memory-operations.js';
<<<<<<< HEAD
import { logger } from './logger.js';
=======
>>>>>>> pr-3-branch
/**
 * Mark a memory as protected (cannot be evicted)
 */
export async function protectMemory(memoryId, reason) {
    await performMemoryOperation(memoryId, {
        name: 'protecting memory',
        updates: {
            isProtected: true,
            metadata: { protectionReason: reason, protectedAt: new Date().toISOString() },
        },
    });
}
/**
 * Pin a memory for automatic injection into context
 */
export async function pinMemory(memoryId) {
    await performMemoryOperation(memoryId, {
        name: 'pinning memory',
        updates: {
            isPinned: true,
            metadata: { pinnedAt: new Date().toISOString() },
        },
    });
}
/**
 * Unpin a memory
 */
export async function unpinMemory(memoryId) {
    await performMemoryOperation(memoryId, {
        name: 'unpinning memory',
        updates: { isPinned: false },
    });
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
        logger.error('Error retrieving pinned memories', error);
        return [];
    }
}
//# sourceMappingURL=governance.js.map