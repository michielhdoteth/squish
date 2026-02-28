/**
 * Shared Requirements Filter Builder
 * Common patterns for building database filters from criteria objects
 */

import { eq, inArray, gte } from 'drizzle-orm';

/**
 * Build database filter array from MemoryCriteria
 */
export function buildMemoryFilters(criteria: any, schema: any): any[] {
  const filters: any[] = [];

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

  return filters;
}

/**
 * Build database filter array from partial criteria (for assertions)
 */
export function buildMemoryFiltersPartial(criteria: any, schema: any): any[] {
  const filters: any[] = [];

  if (criteria.type) {
    filters.push(eq(schema.memories.type as any, criteria.type));
  }

  return filters;
}