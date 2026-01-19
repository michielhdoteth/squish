/**
 * Context Paging Service - Agent-controlled memory loading (Tier 2)
 *
 * Simple memory tracking system that allows agents to:
 * - Load memories into their working set
 * - Evict memories from working set
 * - View what's currently in their working set
 *
 * Note: This does NOT track tokens - Claude is context-aware and manages
 * its own token budget. This just tracks WHAT memories are in the agent's
 * current working set for visibility and management.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { createDatabaseClient } from './database.js';
import { getMemoryById } from '../features/memory/memories.js';
/**
 * Initialize or get a context session
 * Simplified - just tracks what's loaded, not tokens (Claude manages its own context)
 */
export async function initializeContextSession(sessionId, projectId, userId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions } = schema;
    // Check if session exists
    const existing = await db
        .select()
        .from(contextSessions)
        .where(eq(contextSessions.sessionId, sessionId))
        .limit(1);
    if (existing.length === 0) {
        await db.insert(contextSessions).values({
            sessionId,
            projectId: projectId,
            userId: userId,
            loadedMemoryIds: [],
        });
    }
}
/**
 * Load a memory into working set
 * Note: Claude manages its own context - this just tracks what you've loaded
 */
export async function loadMemoryToContext(sessionId, memoryId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions } = schema;
    // Get session
    const session = await db
        .select()
        .from(contextSessions)
        .where(eq(contextSessions.sessionId, sessionId))
        .limit(1);
    if (session.length === 0) {
        return {
            success: false,
            message: `Session "${sessionId}" not found. Initialize session first.`,
        };
    }
    const currentSession = session[0];
    const loadedIds = currentSession.loadedMemoryIds || [];
    // Check if already loaded
    if (loadedIds.includes(memoryId)) {
        return {
            success: false,
            message: `Memory "${memoryId}" is already in working set`,
        };
    }
    // Get memory
    const memory = await getMemoryById(memoryId);
    if (!memory) {
        return {
            success: false,
            message: `Memory "${memoryId}" not found`,
        };
    }
    // Update session
    const newLoadedIds = [...loadedIds, memoryId];
    await db
        .update(contextSessions)
        .set({
        loadedMemoryIds: newLoadedIds,
        updatedAt: new Date(),
    })
        .where(eq(contextSessions.sessionId, sessionId));
    return {
        success: true,
        memory: {
            id: memory.id,
            type: memory.type,
            content: memory.content,
            contentPreview: memory.content.substring(0, 200) + (memory.content.length > 200 ? '...' : ''),
            loadedAt: new Date(),
        },
    };
}
/**
 * Evict a memory from working set
 */
export async function evictMemoryFromContext(sessionId, memoryId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions } = schema;
    // Get session
    const session = await db
        .select()
        .from(contextSessions)
        .where(eq(contextSessions.sessionId, sessionId))
        .limit(1);
    if (session.length === 0) {
        return {
            success: false,
            message: `Session "${sessionId}" not found`,
        };
    }
    const currentSession = session[0];
    const loadedIds = currentSession.loadedMemoryIds || [];
    // Check if loaded
    if (!loadedIds.includes(memoryId)) {
        return {
            success: false,
            message: `Memory "${memoryId}" is not in working set`,
        };
    }
    // Update session
    const newLoadedIds = loadedIds.filter((id) => id !== memoryId);
    await db
        .update(contextSessions)
        .set({
        loadedMemoryIds: newLoadedIds,
        updatedAt: new Date(),
    })
        .where(eq(contextSessions.sessionId, sessionId));
    return {
        success: true,
        message: `Memory "${memoryId}" removed from working set`,
    };
}
/**
 * View all memories in working set
 */
export async function viewLoadedMemories(sessionId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions } = schema;
    // Get session
    const session = await db
        .select()
        .from(contextSessions)
        .where(eq(contextSessions.sessionId, sessionId))
        .limit(1);
    if (session.length === 0) {
        return {
            success: false,
            memories: [],
            count: 0,
        };
    }
    const currentSession = session[0];
    const loadedIds = currentSession.loadedMemoryIds || [];
    if (loadedIds.length === 0) {
        return {
            success: true,
            memories: [],
            count: 0,
        };
    }
    // Get all loaded memories
    const memories = [];
    for (const id of loadedIds) {
        const memory = await getMemoryById(id);
        if (memory) {
            memories.push({
                id: memory.id,
                type: memory.type,
                content: memory.content,
                contentPreview: memory.content.substring(0, 200) + (memory.content.length > 200 ? '...' : ''),
                loadedAt: currentSession.updatedAt,
            });
        }
    }
    return {
        success: true,
        memories,
        count: memories.length,
    };
}
/**
 * Get context status - what's in your working set and what's available
 * Note: Claude manages its own context/tokens - this just shows WHAT you have loaded
 */
export async function getContextStatus(sessionId, projectId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions, memories, observations } = schema;
    // Get session
    const session = await db
        .select()
        .from(contextSessions)
        .where(eq(contextSessions.sessionId, sessionId))
        .limit(1);
    if (session.length === 0) {
        return {
            success: false,
            coreMemory: { sizeBytes: 0, maxBytes: 2048, usagePercent: 0 },
            workingSet: { loadedCount: 0, loadedMemories: [] },
            available: { totalMemories: 0, totalObservations: 0 },
            note: "Session not found. Initialize session first.",
        };
    }
    const currentSession = session[0];
    // Get core memory stats
    const { getCoreMemoryStats } = await import('./core-memory.js');
    const coreStats = await getCoreMemoryStats(projectId);
    // Get loaded memories
    const loadedIds = currentSession.loadedMemoryIds || [];
    const loadedMemories = [];
    for (const id of loadedIds) {
        const memory = await getMemoryById(id);
        if (memory) {
            loadedMemories.push({
                id: memory.id,
                type: memory.type,
                contentLength: memory.content.length,
            });
        }
    }
    // Get external context stats (counts)
    const totalMemories = await db
        .select()
        .from(memories)
        .where(eq(memories.projectId, projectId));
    const totalObservations = await db
        .select()
        .from(observations)
        .where(eq(observations.projectId, projectId));
    return {
        success: true,
        coreMemory: {
            sizeBytes: coreStats.totalBytes,
            maxBytes: coreStats.maxBytes,
            usagePercent: coreStats.usagePercent,
        },
        workingSet: {
            loadedCount: loadedMemories.length,
            loadedMemories,
        },
        available: {
            totalMemories: totalMemories.length,
            totalObservations: totalObservations.length,
        },
        note: "Claude manages its own context and token limits. This shows what memories you've loaded into your working set.",
    };
}
/**
 * Clear all loaded memories from working set
 */
export async function clearLoadedMemories(sessionId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { contextSessions } = schema;
    await db
        .update(contextSessions)
        .set({
        loadedMemoryIds: [],
        updatedAt: new Date(),
    })
        .where(eq(contextSessions.sessionId, sessionId));
    return {
        success: true,
        message: 'All memories cleared from working set',
    };
}
//# sourceMappingURL=context-paging.js.map