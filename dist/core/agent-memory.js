/**
 * Agent-Aware Memory Management
 * Provides agent isolation and visibility rules
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { logger } from './logger.js';
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
        logger.error('Error storing agent memory', error);
        throw error;
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