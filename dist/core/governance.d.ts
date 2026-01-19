/**
 * Memory Governance
 * Implements protection, pinning, and immutability rules
 */
/**
 * Mark a memory as protected (cannot be evicted)
 */
export declare function protectMemory(memoryId: string, reason: string): Promise<void>;
/**
 * Pin a memory for automatic injection into context
 */
export declare function pinMemory(memoryId: string): Promise<void>;
/**
 * Unpin a memory
 */
export declare function unpinMemory(memoryId: string): Promise<void>;
/**
 * Get all pinned memories for auto-injection into context
 */
export declare function getPinnedMemories(): Promise<any[]>;
//# sourceMappingURL=governance.d.ts.map