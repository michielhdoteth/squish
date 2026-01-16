/**
 * Type-specific merge strategies for different memory types
 *
 * Each memory type (fact, preference, decision, observation, context)
 * has different merge semantics to preserve meaning and prevent data loss.
 */
import type { Memory, MemoryType } from '../../../drizzle/schema.js';
export interface MergeStrategy {
    type: MemoryType;
    /**
     * Merge a set of source memories into a single canonical memory
     */
    merge(sources: Memory[]): MergedMemory;
    /**
     * Check if memories can be safely merged
     * Returns { ok, reason } where reason explains why merging is not allowed
     */
    canMerge(sources: Memory[]): {
        ok: boolean;
        reason?: string;
    };
}
export interface MergedMemory {
    content: string;
    summary: string | null;
    tags: string[];
    metadata: Record<string, unknown>;
    mergeReason: string;
    conflictWarnings: string[];
}
export declare const MERGE_STRATEGIES: Record<MemoryType, MergeStrategy>;
/**
 * Get the appropriate merge strategy for a memory type
 */
export declare function getMergeStrategy(type: MemoryType): MergeStrategy;
/**
 * Merge a set of memories using their type-specific strategy
 */
export declare function mergeMemories(sources: Memory[]): MergedMemory;
//# sourceMappingURL=merge-strategies.d.ts.map