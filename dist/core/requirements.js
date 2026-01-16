// Deterministic Memory Requirements
import { eq, and, inArray, gte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
export class MemoryRequirementError extends Error {
    missingCriteria;
    context;
    constructor(message, missingCriteria, context) {
        super(message);
        this.missingCriteria = missingCriteria;
        this.context = context;
        this.name = 'MemoryRequirementError';
        Object.setPrototypeOf(this, MemoryRequirementError.prototype);
    }
}
export async function requireMemory(criteria) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const filters = [];
        const now = new Date();
        if (criteria.type) {
            filters.push(eq(schema.memories.type, criteria.type));
        }
        if (criteria.types && criteria.types.length > 0) {
            filters.push(inArray(schema.memories.type, criteria.types));
        }
        if (criteria.sector) {
            filters.push(eq(schema.memories.sector, criteria.sector));
        }
        if (criteria.minConfidence !== undefined) {
            filters.push(gte(schema.memories.confidence, criteria.minConfidence));
        }
        if (criteria.minRelevance !== undefined) {
            filters.push(gte(schema.memories.relevanceScore, criteria.minRelevance));
        }
        if (criteria.projectId) {
            filters.push(eq(schema.memories.projectId, criteria.projectId));
        }
        if (criteria.agentId) {
            filters.push(eq(schema.memories.agentId, criteria.agentId));
        }
        let query = filters.length > 0 ? and(...filters) : undefined;
        const memories = await db
            .select()
            .from(schema.memories)
            .where(query)
            .limit(1);
        if (memories.length === 0) {
            const msg = 'Required memory not found';
            throw new MemoryRequirementError(msg, criteria, { filters: filters.length });
        }
        return memories[0];
    }
    catch (error) {
        if (error instanceof MemoryRequirementError) {
            throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new MemoryRequirementError('Error checking memory requirement: ' + msg, criteria);
    }
}
export async function assertMemoryPresent(memoryId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const memory = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, memoryId))
            .limit(1);
        if (memory.length === 0) {
            throw new MemoryRequirementError('Required memory is not present: ' + memoryId, { memoryId }, { type: 'assertPresent' });
        }
    }
    catch (error) {
        if (error instanceof MemoryRequirementError) {
            throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new MemoryRequirementError('Error asserting memory presence: ' + msg, { memoryId });
    }
}
export async function assertMemoryNotPresent(criteria) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const filters = [];
        if (criteria.type) {
            filters.push(eq(schema.memories.type, criteria.type));
        }
        let query = filters.length > 0 ? and(...filters) : undefined;
        const memories = await db
            .select()
            .from(schema.memories)
            .where(query)
            .limit(1);
        if (memories.length > 0) {
            throw new MemoryRequirementError('Memory should not exist but was found', criteria, { found: memories[0].id });
        }
    }
    catch (error) {
        if (error instanceof MemoryRequirementError) {
            throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new MemoryRequirementError('Error checking memory non-presence: ' + msg, criteria);
    }
}
export async function requireMemories(criteria, minCount = 1) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const filters = [];
        if (criteria.type) {
            filters.push(eq(schema.memories.type, criteria.type));
        }
        if (criteria.minConfidence !== undefined) {
            filters.push(gte(schema.memories.confidence, criteria.minConfidence));
        }
        let query = filters.length > 0 ? and(...filters) : undefined;
        const memories = await db
            .select()
            .from(schema.memories)
            .where(query)
            .limit(100);
        if (memories.length < minCount) {
            const msg = 'Required ' + minCount + ' memories but found ' + memories.length;
            throw new MemoryRequirementError(msg, criteria, { found: memories.length, required: minCount });
        }
        return memories;
    }
    catch (error) {
        if (error instanceof MemoryRequirementError) {
            throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new MemoryRequirementError('Error checking memory requirements: ' + msg, criteria);
    }
}
export async function requireHighConfidenceMemory(criteria, minConfidence = 80) {
    return requireMemory({ ...criteria, minConfidence });
}
export async function requireRecentMemory(criteria, maxAgeDays = 7) {
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    return requireMemory({ ...criteria, maxAge });
}
//# sourceMappingURL=requirements.js.map