// Deterministic Memory Requirements
import { eq, and, inArray, gte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';

export class MemoryRequirementError extends Error {
  constructor(
    message: string,
    public readonly missingCriteria: any,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'MemoryRequirementError';
    Object.setPrototypeOf(this, MemoryRequirementError.prototype);
  }
}

export interface MemoryCriteria {
  tag?: string;
  type?: string;
  types?: string[];
  sector?: string;
  minAge?: number;
  maxAge?: number;
  minConfidence?: number;
  minRelevance?: number;
  projectId?: string;
  agentId?: string;
  visibilityScope?: string;
}

export async function requireMemory(criteria: MemoryCriteria): Promise<any> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const filters: any[] = [];
    const now = new Date();

    if (criteria.type) {
      filters.push(eq(schema.memories.type as any, criteria.type));
    }

    if (criteria.types && criteria.types.length > 0) {
      filters.push(inArray(schema.memories.type as any, criteria.types));
    }

    if (criteria.sector) {
      filters.push(eq(schema.memories.sector as any, criteria.sector));
    }

    if (criteria.minConfidence !== undefined) {
      filters.push(gte(schema.memories.confidence as any, criteria.minConfidence));
    }

    if (criteria.minRelevance !== undefined) {
      filters.push(gte(schema.memories.relevanceScore as any, criteria.minRelevance));
    }

    if (criteria.projectId) {
      filters.push(eq(schema.memories.projectId, criteria.projectId));
    }

    if (criteria.agentId) {
      filters.push(eq(schema.memories.agentId as any, criteria.agentId));
    }

    let query = filters.length > 0 ? and(...filters) : undefined;

    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(query)
      .limit(1);

    if (memories.length === 0) {
      const msg = 'Required memory not found';
      throw new MemoryRequirementError(msg, criteria, { filters: filters.length });
    }

    return memories[0];
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError('Error checking memory requirement: ' + msg, criteria);
  }
}

export async function assertMemoryPresent(memoryId: string): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const memory = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) {
      throw new MemoryRequirementError(
        'Required memory is not present: ' + memoryId,
        { memoryId },
        { type: 'assertPresent' }
      );
    }
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError('Error asserting memory presence: ' + msg, { memoryId });
  }
}

export async function assertMemoryNotPresent(criteria: MemoryCriteria): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const filters: any[] = [];

    if (criteria.type) {
      filters.push(eq(schema.memories.type as any, criteria.type));
    }

    let query = filters.length > 0 ? and(...filters) : undefined;

    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(query)
      .limit(1);

    if (memories.length > 0) {
      throw new MemoryRequirementError(
        'Memory should not exist but was found',
        criteria,
        { found: memories[0].id }
      );
    }
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError('Error checking memory non-presence: ' + msg, criteria);
  }
}

export async function requireMemories(criteria: MemoryCriteria, minCount: number = 1): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const filters: any[] = [];

    if (criteria.type) {
      filters.push(eq(schema.memories.type as any, criteria.type));
    }

    if (criteria.minConfidence !== undefined) {
      filters.push(gte(schema.memories.confidence as any, criteria.minConfidence));
    }

    let query = filters.length > 0 ? and(...filters) : undefined;

    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(query)
      .limit(100);

    if (memories.length < minCount) {
      const msg = 'Required ' + minCount + ' memories but found ' + memories.length;
      throw new MemoryRequirementError(msg, criteria, { found: memories.length, required: minCount });
    }

    return memories;
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError('Error checking memory requirements: ' + msg, criteria);
  }
}

export async function requireHighConfidenceMemory(
  criteria: MemoryCriteria,
  minConfidence: number = 80
): Promise<any> {
  return requireMemory({ ...criteria, minConfidence });
}

export async function requireRecentMemory(
  criteria: MemoryCriteria,
  maxAgeDays: number = 7
): Promise<any> {
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  return requireMemory({ ...criteria, maxAge });
}
