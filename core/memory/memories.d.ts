import { MemoryRecord, MemoryType } from '../lib/types.js';
import type { VisibilityScope } from '../team/types.js';
import type { TeamAccessContext } from '../team/types.js';
export interface RememberInput {
    content: string;
    type?: MemoryType;
    tags?: string[];
    project?: string;
    user?: string;
    actorUser?: string;
    actorAgent?: string;
    visibilityScope?: VisibilityScope;
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
    actorUser?: string;
    actorAgent?: string;
    visibilityScope?: VisibilityScope | VisibilityScope[];
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
export declare function getMemory(id: string, incrementAccess?: boolean, actor?: TeamAccessContext): Promise<MemoryRecord | null>;
export declare function setConfidence(id: string, level: 'certain' | 'speculative' | 'outdated'): Promise<boolean>;
export declare function getRecent(projectPath: string, limit: number, actor?: TeamAccessContext): Promise<MemoryRecord[]>;
export declare function search(input: SearchInput): Promise<SearchResult[]>;
/**
 * Find similar memories to prevent duplicates
 * Returns memories with similarity >= threshold
 */
export declare function findSimilarMemories(content: string, threshold?: number, limit?: number): Promise<SearchResult[]>;
//# sourceMappingURL=memories.d.ts.map