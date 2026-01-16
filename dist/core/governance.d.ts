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
 * Make a memory immutable (cannot be updated)
 */
export declare function makeImmutable(memoryId: string, reason: string): Promise<void>;
/**
 * Check if an actor can modify a memory
 */
export declare function canModifyMemory(memoryId: string, actorId: string): Promise<boolean>;
/**
 * Check if an actor can read a memory
 */
export declare function canReadMemory(memoryId: string, actorId: string): Promise<boolean>;
/**
 * Set custom write scope for a memory
 */
export declare function setWriteScope(memoryId: string, scope: string[]): Promise<void>;
/**
 * Set custom read scope for a memory
 */
export declare function setReadScope(memoryId: string, scope: string[]): Promise<void>;
/**
 * Get governance status of a memory
 */
export declare function getGovernanceStatus(memoryId: string): Promise<{
    isProtected: boolean;
    isPinned: boolean;
    isImmutable: boolean;
    writeScope?: string[];
    readScope?: string[];
    visibilityScope?: string;
}>;
/**
 * Get all pinned memories for auto-injection into context
 */
export declare function getPinnedMemories(): Promise<any[]>;
//# sourceMappingURL=governance.d.ts.map