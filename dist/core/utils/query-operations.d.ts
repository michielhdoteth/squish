/**
 * Shared Requirements Query Operations
 * Common patterns for database queries with error handling
 */
export declare class MemoryRequirementError extends Error {
    readonly missingCriteria: any;
    readonly context?: any | undefined;
    constructor(message: string, missingCriteria: any, context?: any | undefined);
}
/**
 * Execute a memory requirement query with standard error handling
 */
export declare function executeMemoryQuery(criteria: any, filters: any[], limit?: number, operation?: string): Promise<any[]>;
/**
 * Execute a memory assertion query (expecting specific results)
 */
export declare function executeMemoryAssertion(criteria: any, filters: any[], expectedCount: number, operation: string, errorMessage: string): Promise<any[]>;
//# sourceMappingURL=query-operations.d.ts.map