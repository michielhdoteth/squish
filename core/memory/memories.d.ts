import { MemoryRecord, MemoryType } from '../lib/types.js';
export type { MemoryRecord, MemoryType };
export interface RememberInput {
    content: string;
    type?: MemoryType;
    tags?: string[];
    project?: string;
    user?: string;
    metadata?: Record<string, unknown>;
    source?: string;
    reasoning?: string;
    memoryContext?: string;
    examples?: string;
    exceptions?: string;
    namespaceId?: string;
    sessionId?: string;
    sessionStartTime?: string;
    toolName?: string;
    placeType?: string;
}
export declare function getOrCreateUser(identifier: string, existingDb?: any, existingSchema?: any): Promise<{
    id: string;
} | null>;
export interface SearchInput {
    query: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
    project?: string;
    user?: string;
    placeId?: string;
    placeType?: string;
    sessionId?: string;
    sessionStartTime?: string;
    /** Enable retrieval trace for debugging (Phase 8) */
    trace?: boolean;
}
export interface SearchResult extends MemoryRecord {
    similarity: number;
    /** Retrieval trace for debugging (Phase 8) - populated when trace: true */
    _trace?: import('../retrieval/config.js').RetrievalTrace;
}
export declare function rememberMemory(input: RememberInput): Promise<MemoryRecord>;
export declare function getMemory(id: string, incrementAccess?: boolean): Promise<MemoryRecord | null>;
/**
 * Batch-fetch memories by IDs (fixes N+1 query in walking.ts)
 * Returns memories in the same order as the input IDs, skipping any that are not found.
 */
export declare function getMemoriesByIds(ids: string[], incrementAccess?: boolean): Promise<MemoryRecord[]>;
export declare function setConfidence(id: string, level: 'certain' | 'speculative' | 'outdated'): Promise<boolean>;
export declare function getRecent(projectPath: string, limit: number): Promise<MemoryRecord[]>;
export declare function search(input: SearchInput): Promise<SearchResult[]>;
/**
 * Find similar memories to prevent duplicates
 * Returns memories with similarity >= threshold
 */
export declare function findSimilarMemories(content: string, threshold?: number, limit?: number): Promise<SearchResult[]>;
//# sourceMappingURL=memories.d.ts.map