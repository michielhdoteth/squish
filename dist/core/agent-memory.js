/**
 * Agent-Aware Memory Management
 * Provides agent isolation and visibility rules
 */
import { and, eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
/**
 * Store a memory with agent context
 */
export async function storeAgentMemory(content, context, options = {}) {
    if (!config.agentIsolationEnabled) {
        // Fall back to standard memory storage
        return await storeStandardMemory(content, options);
    }
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memoryId = randomUUID();
        const embedding = await getEmbedding(content);
        const visibilityScope = options.visibilityScope || config.defaultVisibilityScope;
        // Determine scopes based on visibility
        const readScope = calculateReadScope(context, visibilityScope);
        const writeScope = [`agent:${context.agentId}`];
        await db.insert(schema.memories).values({
            id: memoryId,
            content,
            type: options.type || 'observation',
            sector: options.sector || 'episodic',
            agentId: context.agentId,
            agentRole: context.agentRole || 'general',
            userId: context.userId || null,
            projectId: context.projectId || null,
            visibilityScope,
            writeScope,
            readScope,
            tags: options.tags || [],
            metadata: options.metadata || null,
            embedding: embedding || null,
            confidence: 100,
            relevanceScore: 50,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return memoryId;
    }
    catch (error) {
        console.error('[squish] Error storing agent memory:', error);
        throw error;
    }
}
/**
 * Search memories accessible to an agent
 */
export async function searchAgentMemories(query, context, options = {}) {
    if (!config.agentIsolationEnabled) {
        // Fall back to standard search
        return await searchStandardMemories(query, options);
    }
    try {
        const db = await getDb();
        const schema = await getSchema();
        const limit = Math.min(options.limit || 10, 100);
        // Build visibility filter
        const visibilityFilters = [eq(schema.memories.agentId, context.agentId)];
        if (options.includeShared && context.projectId) {
            visibilityFilters.push(and(eq(schema.memories.projectId, context.projectId), inArray(schema.memories.visibilityScope, ['project', 'team', 'global'])));
        }
        // Build where clause
        let where = visibilityFilters.length > 1 ? or(...visibilityFilters) : visibilityFilters[0];
        if (options.type) {
            where = and(where, eq(schema.memories.type, options.type));
        }
        // Search by content (ILIKE for keyword search)
        where = and(where, inArray(schema.memories.id, await db
            .select({ id: schema.memories.id })
            .from(schema.memories)
            .where(schema.memories.content.ilike(`%${query}%`))));
        const memories = await db
            .select()
            .from(schema.memories)
            .where(where)
            .limit(limit);
        return memories;
    }
    catch (error) {
        console.error('[squish] Error searching agent memories:', error);
        return [];
    }
}
/**
 * Get pinned memories for an agent
 */
export async function getPinnedMemories(context, limit = 10) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        // Get memories pinned for this agent
        const memories = await db
            .select()
            .from(schema.memories)
            .where(and(eq(schema.memories.agentId, context.agentId), eq(schema.memories.isPinned, true)))
            .limit(limit);
        return memories;
    }
    catch (error) {
        console.error('[squish] Error getting pinned memories:', error);
        return [];
    }
}
/**
 * Check if an agent can access a memory
 */
export async function canAgentAccessMemory(memoryId, context) {
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
        // Owner always has access
        if (m.agentId === context.agentId)
            return true;
        // Check visibility scope
        if (m.visibilityScope === 'private')
            return false;
        if (m.visibilityScope === 'project' && m.projectId !== context.projectId)
            return false;
        if (m.visibilityScope === 'team')
            return true;
        if (m.visibilityScope === 'global')
            return true;
        return false;
    }
    catch (error) {
        console.error('[squish] Error checking agent access:', error);
        return false;
    }
}
/**
 * List all agents that have stored memories
 */
export async function listAgents() {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const agents = await db
            .selectDistinct({
            agentId: schema.memories.agentId,
            agentRole: schema.memories.agentRole,
        })
            .from(schema.memories)
            .where(schema.memories.agentId.isNotNull());
        return agents;
    }
    catch (error) {
        console.error('[squish] Error listing agents:', error);
        return [];
    }
}
/**
 * Get memory statistics for an agent
 */
export async function getAgentStats(context) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memories = await db
            .select({
            id: schema.memories.id,
            type: schema.memories.type,
            sector: schema.memories.sector,
            visibilityScope: schema.memories.visibilityScope,
        })
            .from(schema.memories)
            .where(eq(schema.memories.agentId, context.agentId));
        const stats = {
            totalMemories: memories.length,
            byType: {},
            bySector: {},
            sharedMemories: 0,
        };
        for (const mem of memories) {
            stats.byType[mem.type] = (stats.byType[mem.type] || 0) + 1;
            stats.bySector[mem.sector] = (stats.bySector[mem.sector] || 0) + 1;
            if (mem.visibilityScope !== 'private')
                stats.sharedMemories++;
        }
        return stats;
    }
    catch (error) {
        console.error('[squish] Error getting agent stats:', error);
        return {
            totalMemories: 0,
            byType: {},
            bySector: {},
            sharedMemories: 0,
        };
    }
}
// ============================================================================
// Helper Functions
// ============================================================================
function calculateReadScope(context, visibility) {
    switch (visibility) {
        case 'private':
            return [`agent:${context.agentId}`];
        case 'project':
            return [`agent:${context.agentId}`, `project:${context.projectId || '*'}`];
        case 'team':
            return [`agent:${context.agentId}`, 'team:*'];
        case 'global':
            return ['*'];
        default:
            return [`agent:${context.agentId}`];
    }
}
async function storeStandardMemory(content, options = {}) {
    // Fallback to standard memory storage if agent isolation is disabled
    const db = await getDb();
    const schema = await getSchema();
    const memoryId = randomUUID();
    const embedding = await getEmbedding(content);
    await db.insert(schema.memories).values({
        id: memoryId,
        content,
        type: options.type || 'observation',
        sector: options.sector || 'episodic',
        tags: options.tags || [],
        metadata: options.metadata || null,
        embedding: embedding || null,
        confidence: 100,
        relevanceScore: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return memoryId;
}
async function searchStandardMemories(query, options = {}) {
    // Fallback to standard memory search if agent isolation is disabled
    const db = await getDb();
    const schema = await getSchema();
    const limit = Math.min(options.limit || 10, 100);
    let where = undefined;
    if (options.type) {
        where = eq(schema.memories.type, options.type);
    }
    return await db
        .select()
        .from(schema.memories)
        .where(where
        ? and(where, schema.memories.content.ilike(`%${query}%`))
        : schema.memories.content.ilike(`%${query}%`))
        .limit(limit);
}
//# sourceMappingURL=agent-memory.js.map