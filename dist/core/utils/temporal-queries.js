/**
 * Shared Temporal Query Utilities
 * Common patterns for temporal database queries
 */
import { and, eq, lte, gte, or, isNull } from 'drizzle-orm';
/**
 * Build temporal validity filters for queries
 */
export function buildTemporalFilters(schema, timestamp = new Date(), additionalFilters = []) {
    const filters = [
        lte(schema.validFrom, timestamp),
        or(isNull(schema.validTo), gte(schema.validTo, timestamp)),
        ...additionalFilters
    ];
    return filters;
}
/**
 * Build temporal query for facts at a specific time
 */
export function buildFactAtTimeQuery(schema, timestamp = new Date(), additionalFilters = []) {
    const filters = buildTemporalFilters(schema, timestamp, [
        eq(schema.type, 'fact'),
        ...additionalFilters
    ]);
    return and(...filters);
}
//# sourceMappingURL=temporal-queries.js.map