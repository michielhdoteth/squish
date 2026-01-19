// Deterministic Memory Requirements
import { eq } from 'drizzle-orm';
import { getSchema } from '../db/schema.js';
import { buildMemoryFilters, buildMemoryFiltersPartial } from './utils/filter-builder.js';
import { executeMemoryAssertion } from './utils/query-operations.js';
export async function requireMemory(criteria) {
    const schema = await getSchema();
    const filters = buildMemoryFilters(criteria, schema);
    const memories = await executeMemoryAssertion(criteria, filters, 1, 'memory requirement', 'Required memory not found');
    return memories[0];
}
export async function assertMemoryPresent(memoryId) {
    const criteria = { memoryId };
    const schema = await getSchema();
    const filters = [eq(schema.memories.id, memoryId)];
    await executeMemoryAssertion(criteria, filters, 1, 'asserting memory presence', 'Required memory is not present: ' + memoryId);
}
export async function assertMemoryNotPresent(criteria) {
    const schema = await getSchema();
    const filters = buildMemoryFiltersPartial(criteria, schema);
    await executeMemoryAssertion(criteria, filters, 0, 'checking memory non-presence', 'Memory should not exist but was found');
}
export async function requireMemories(criteria, minCount = 1) {
    const schema = await getSchema();
    const filters = buildMemoryFilters(criteria, schema);
    return executeMemoryAssertion(criteria, filters, minCount, 'checking memory requirements', `Required ${minCount} memories but found fewer`);
}
export async function requireHighConfidenceMemory(criteria, minConfidence = 80) {
    return requireMemory({ ...criteria, minConfidence });
}
export async function requireRecentMemory(criteria, maxAgeDays = 7) {
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    return requireMemory({ ...criteria, maxAge });
}
//# sourceMappingURL=requirements.js.map