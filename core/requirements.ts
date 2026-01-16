// Deterministic Memory Requirements
import { eq } from 'drizzle-orm';
import { getSchema } from '../db/schema.js';
import { buildMemoryFilters, buildMemoryFiltersPartial } from './utils/filter-builder.js';
import { executeMemoryQuery, executeMemoryAssertion, MemoryRequirementError } from './utils/query-operations.js';

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
  const schema = await getSchema();
  const filters = buildMemoryFilters(criteria, schema);

  const memories = await executeMemoryAssertion(
    criteria,
    filters,
    1,
    'memory requirement',
    'Required memory not found'
  );

  return memories[0];
}

export async function assertMemoryPresent(memoryId: string): Promise<void> {
  const criteria = { memoryId };
  const schema = await getSchema();
  const filters = [eq(schema.memories.id, memoryId)];

  await executeMemoryAssertion(
    criteria,
    filters,
    1,
    'asserting memory presence',
    'Required memory is not present: ' + memoryId
  );
}

export async function assertMemoryNotPresent(criteria: MemoryCriteria): Promise<void> {
  const schema = await getSchema();
  const filters = buildMemoryFiltersPartial(criteria, schema);

  await executeMemoryAssertion(
    criteria,
    filters,
    0,
    'checking memory non-presence',
    'Memory should not exist but was found'
  );
}

export async function requireMemories(criteria: MemoryCriteria, minCount: number = 1): Promise<any[]> {
  const schema = await getSchema();
  const filters = buildMemoryFilters(criteria, schema);

  return executeMemoryAssertion(
    criteria,
    filters,
    minCount,
    'checking memory requirements',
    `Required ${minCount} memories but found fewer`
  );
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
