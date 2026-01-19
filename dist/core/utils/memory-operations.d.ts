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
/**
 * Redis publish operation with error handling
 */
export declare function performRedisPublish(getRedisClient: () => Promise<any>, channel: string, message: unknown): Promise<void>;
//# sourceMappingURL=memory-operations.d.ts.map