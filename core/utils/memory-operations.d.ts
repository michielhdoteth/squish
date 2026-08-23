/**
 * Shared Memory Operations Utilities
 * Common patterns for memory governance operations
 */
/**
 * Generic memory operation with governance checks and error handling
 */
export declare function performMemoryOperation(memoryId: string, operation: {
    name: string;
    updates: Record<string, any>;
    requiresGovernance?: boolean;
}): Promise<void>;
//# sourceMappingURL=memory-operations.d.ts.map