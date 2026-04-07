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

import { eq, and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getMemory } from './memory/memories.js';
import { getDbClient } from './db-client.js';

interface LoadedMemory {
  id: string;
  type: string;
  content: string;
  contentPreview: string;
  loadedAt: Date;
}

/**
 * Initialize or get a context session
 * Simplified - just tracks what's loaded, not tokens (Claude manages its own context)
 */
export async function initializeContextSession(
  sessionId: string,
  projectId: string,
  userId?: string
): Promise<void> {
  const { db, schema } = await getDbClient();
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
      projectId: projectId as any,
      userId: userId || null,
      loadedMemoryIds: JSON.stringify([]) as any,
      tokenBudget: 8000,
      tokensUsed: 0,
      coreMemoryTokens: 0,
      loadedMemoriesTokens: 0,
      metadata: JSON.stringify({}) as any,
    } as any);
  }
}

/**
 * Load a memory into working set
 * Note: Claude manages its own context - this just tracks what you've loaded
 */
export async function loadMemoryToContext(
    sessionId: string,
    memoryId: string
  ): Promise<{
    success: boolean;
    message?: string;
    memory?: LoadedMemory;
  }> {
    const { db, schema } = await getDbClient();
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
  const loadedIds = (currentSession.loadedMemoryIds as string[]) || [];

  // Check if already loaded
  if (loadedIds.includes(memoryId)) {
    return {
      success: false,
      message: `Memory "${memoryId}" is already in working set`,
    };
  }

  // Get memory
  const memory = await getMemory(memoryId);
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
      loadedMemoryIds: newLoadedIds as any,
      updatedAt: new Date() as any,
    } as any)
    .where(eq(contextSessions.sessionId, sessionId));

  // Also update memory's contextStatus to 'in-context'
  await db
    .update(schema.memories as any)
    .set({
      contextStatus: 'in-context' as any,
    })
    .where(eq((schema.memories as any).id, memoryId));

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
export async function evictMemoryFromContext(
    sessionId: string,
    memoryId: string
  ): Promise<{
    success: boolean;
    message?: string;
  }> {
    const { db, schema } = await getDbClient();
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
  const loadedIds = (currentSession.loadedMemoryIds as string[]) || [];

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
      loadedMemoryIds: newLoadedIds as any,
      updatedAt: new Date() as any,
    } as any)
    .where(eq(contextSessions.sessionId, sessionId));

  // Also update memory's contextStatus to 'out-of-context'
  await db
    .update(schema.memories as any)
    .set({
      contextStatus: 'out-of-context' as any,
    })
    .where(eq((schema.memories as any).id, memoryId));

  return {
    success: true,
    message: `Memory "${memoryId}" removed from working set`,
  };
}

/**
 * View all memories in working set
 */
export async function viewLoadedMemories(
    sessionId: string
  ): Promise<{
    success: boolean;
    memories: LoadedMemory[];
    count: number;
  }> {
    const { db, schema } = await getDbClient();
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
  const loadedIds = (currentSession.loadedMemoryIds as string[]) || [];

  if (loadedIds.length === 0) {
    return {
      success: true,
      memories: [],
      count: 0,
    };
  }

  // Get all loaded memories
  const memories: LoadedMemory[] = [];
  for (const id of loadedIds) {
    const memory = await getMemory(id);
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
export async function getContextStatus(
    sessionId: string,
    projectId: string
  ): Promise<{
    success: boolean;
    coreMemory: {
      sizeBytes: number;
      maxBytes: number;
      usagePercent: number;
    };
    workingSet: {
      loadedCount: number;
      loadedMemories: Array<{
        id: string;
        type: string;
        contentLength: number;
      }>;
    };
    available: {
      totalMemories: number;
      totalObservations: number;
    };
    note: string;
  }> {
    const { db, schema } = await getDbClient();
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
  const loadedIds = (currentSession.loadedMemoryIds as string[]) || [];
  const loadedMemories = [];
  for (const id of loadedIds) {
    const memory = await getMemory(id);
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
    .where(eq(memories.projectId, projectId as any));

  const totalObservations = await db
    .select()
    .from(observations)
    .where(eq(observations.projectId, projectId as any));

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
export async function clearLoadedMemories(sessionId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    const { db, schema } = await getDbClient();
    const { contextSessions } = schema;

  await db
    .update(contextSessions)
    .set({
      loadedMemoryIds: [] as any,
      updatedAt: new Date() as any,
    } as any)
    .where(eq(contextSessions.sessionId, sessionId));

  return {
    success: true,
    message: 'All memories cleared from working set',
  };
}

/**
 * Get all memories currently marked as in-context for a session
 */
export async function getInContextMemories(
    sessionId: string
  ): Promise<LoadedMemory[]> {
    const { db, schema } = await getDbClient();
    const { contextSessions } = schema;

  // Get session to find project
  const session = await db
    .select()
    .from(contextSessions)
    .where(eq(contextSessions.sessionId, sessionId))
    .limit(1);

  if (session.length === 0) {
    return [];
  }

  const { memories } = schema;
  const projectId = session[0].projectId;

  // Get all in-context memories
  const inContextMemories = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.projectId, projectId as any),
        eq(memories.contextStatus, 'in-context' as any)
      )
    );

  return inContextMemories.map((mem: any) => ({
    id: mem.id,
    type: mem.type,
    content: mem.content,
    contentPreview: mem.content.substring(0, 200) + (mem.content.length > 200 ? '...' : ''),
    loadedAt: mem.updatedAt,
  }));
}

/**
 * Get out-of-context (archived) memories for a project
 */
export async function getOutOfContextMemories(
  projectId: string,
  limit: number = 10
): Promise<LoadedMemory[]> {
  const { db, schema } = await getDbClient();
  const { memories } = schema;

  // Get out-of-context memories, ordered by last accessed
  const outOfContextMemories = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.projectId, projectId as any),
        eq(memories.contextStatus, 'out-of-context' as any)
      )
    )
    .orderBy(sql`COALESCE(${memories.lastAccessedAt}, ${memories.createdAt}) DESC`)
    .limit(limit);

  return outOfContextMemories.map((mem: any) => ({
    id: mem.id,
    type: mem.type,
    content: mem.content,
    contentPreview: mem.content.substring(0, 200) + (mem.content.length > 200 ? '...' : ''),
    loadedAt: mem.lastAccessedAt || mem.createdAt,
  }));
}
