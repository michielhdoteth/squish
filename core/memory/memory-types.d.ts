/**
 * Memory type definitions.
 *
 * Interfaces and re-exports for the memory system. Extracted from
 * memories.ts to keep type definitions in a single, dependency-free module.
 */
import type { MemoryRecord, MemoryType } from '../lib/types.js';
export type { MemoryRecord, MemoryType };
import type { VisibilityScope } from '../lib/utils.js';
export type { VisibilityScope };
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
//# sourceMappingURL=memory-types.d.ts.map