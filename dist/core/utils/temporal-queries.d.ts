/**
 * Shared Temporal Query Utilities
 * Common patterns for temporal database queries
 */
/**
 * Build temporal validity filters for queries
 */
export declare function buildTemporalFilters(schema: any, timestamp?: Date, additionalFilters?: any[]): any[];
/**
 * Build temporal query for facts at a specific time
 */
export declare function buildFactAtTimeQuery(schema: any, timestamp?: Date, additionalFilters?: any[]): any;
//# sourceMappingURL=temporal-queries.d.ts.map