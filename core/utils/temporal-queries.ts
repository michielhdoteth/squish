/**
 * Shared Temporal Query Utilities
 * Common patterns for temporal database queries
 */

import { and, eq, lte, gte, or, isNull } from 'drizzle-orm';

/**
 * Build temporal validity filters for queries
 */
export function buildTemporalFilters(
  schema: any,
  timestamp: Date = new Date(),
  additionalFilters: any[] = []
): any[] {
  const filters = [
    lte(schema.validFrom as any, timestamp),
    or(isNull(schema.validTo), gte(schema.validTo as any, timestamp)),
    ...additionalFilters
  ];

  return filters;
}

/**
 * Build temporal query for facts at a specific time
 */
export function buildFactAtTimeQuery(
  schema: any,
  timestamp: Date = new Date(),
  additionalFilters: any[] = []
): any {
  const filters = buildTemporalFilters(schema, timestamp, [
    eq(schema.type as any, 'fact'),
    ...additionalFilters
  ]);

  return and(...filters);
}