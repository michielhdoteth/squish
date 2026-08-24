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
    /**
     * Include consolidated source memories (isConsolidated = 1) in search
     * candidates. Default false; set true to explicitly request them.
     */
    includeConsolidatedSources?: boolean;
}
export interface SearchResult extends MemoryRecord {
    /**
     * @deprecated Batch 3: alias of the served score (finalScore under v2
     * serving). Read semanticScore / boostScore / finalScore explicitly.
     */
    similarity: number;
    /** Honest retrieval relevance (cosine / normalized RRF), boost-free. */
    semanticScore?: number;
    /** Sum of additive adjustments; itemized in scoreBreakdown. */
    boostScore?: number;
    /** clamp01(semanticScore + boostScore) - the v2 ordering score. */
    finalScore?: number;
    /** Per-component additive adjustments. */
    scoreBreakdown?: import('../scoring/three-field.js').ScoreBreakdown;
    /** Retrieval trace for debugging (Phase 8) - populated when trace: true */
    _trace?: import('../retrieval/config.js').RetrievalTrace;
}
//# sourceMappingURL=memory-types.d.ts.map