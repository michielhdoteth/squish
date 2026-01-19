/**
 * Context Paging Service - Agent-controlled memory loading (Tier 2)
 *
 * Simple memory tracking system that allows agents to:
 * - Load memories into their working set
 * - Evict memories from working set
 * - View what's currently in their working set
 *
 * Note: This does NOT track tokens - Claude is context-aware and manages
 * its own token budget. This just tracks WHAT memories are in the agent's
 * current working set for visibility and management.
 */
interface LoadedMemory {
    id: string;
    type: string;
    content: string;
    contentPreview: string;
    loadedAt: Date;
}
/**
 * Initialize or get a context session
 * Simplified - just tracks what's loaded, not tokens (Claude manages its own context)
 */
export declare function initializeContextSession(sessionId: string, projectId: string, userId?: string): Promise<void>;
/**
 * Load a memory into working set
 * Note: Claude manages its own context - this just tracks what you've loaded
 */
export declare function loadMemoryToContext(sessionId: string, memoryId: string): Promise<{
    success: boolean;
    message?: string;
    memory?: LoadedMemory;
}>;
/**
 * Evict a memory from working set
 */
export declare function evictMemoryFromContext(sessionId: string, memoryId: string): Promise<{
    success: boolean;
    message?: string;
}>;
/**
 * View all memories in working set
 */
export declare function viewLoadedMemories(sessionId: string): Promise<{
    success: boolean;
    memories: LoadedMemory[];
    count: number;
}>;
/**
 * Get context status - what's in your working set and what's available
 * Note: Claude manages its own context/tokens - this just shows WHAT you have loaded
 */
export declare function getContextStatus(sessionId: string, projectId: string): Promise<{
    success: boolean;
    coreMemory: {
        sizeBytes: number;
        maxBytes: number;
        usagePercent: number;
    };
    workingSet: {
        loadedCount: number;
        loadedMemories: Array<{
            id: string;
            type: string;
            contentLength: number;
        }>;
    };
    available: {
        totalMemories: number;
        totalObservations: number;
    };
    note: string;
}>;
/**
 * Clear all loaded memories from working set
 */
export declare function clearLoadedMemories(sessionId: string): Promise<{
    success: boolean;
    message?: string;
}>;
export {};
//# sourceMappingURL=context-paging.d.ts.map