/**
 * Unified Knowledge Extractor
 *
 * Single pipeline that extracts beliefs, strategies, and memory metadata
 * from conversations, learnings, and existing knowledge.
 */
import type { ExtractedBelief, ExtractedStrategy } from './types.js';
/**
 * Unified extraction result — can be a belief or strategy.
 * Memory metadata extraction is handled separately (by the memory subsystem).
 */
export type ExtractedKnowledge = {
    kind: 'belief';
    data: ExtractedBelief;
} | {
    kind: 'strategy';
    data: ExtractedStrategy;
};
/**
 * Extraction options.
 */
export interface ExtractionOptions {
    projectId?: string;
    sourceType?: 'conversation' | 'learning' | 'belief' | 'trace' | 'memory';
    sourceId?: string;
    /** Minimum confidence threshold to include results */
    minConfidence?: number;
}
/**
 * Extract beliefs from a memory.
 * Wraps the belief extraction logic into the unified pipeline.
 */
export declare function extractBeliefs(input: {
    memoryId: string;
    content: string;
    type: string;
    metadata?: Record<string, unknown> | null;
}, options?: ExtractionOptions): ExtractedBelief[];
/**
 * Extract strategies from conversation text.
 */
export declare function extractStrategiesFromConversation(conversation: string, options?: ExtractionOptions): ExtractedStrategy[];
/**
 * Extract strategies from a learning entry.
 */
export declare function extractStrategiesFromLearningEntry(learning: {
    content: string;
    type: string;
}, options?: ExtractionOptions): ExtractedStrategy[];
/**
 * Extract strategies from a belief.
 */
export declare function extractStrategiesFromBeliefEntry(belief: {
    statement: string;
    beliefType: string;
}, options?: ExtractionOptions): ExtractedStrategy[];
/**
 * Extract ALL knowledge (beliefs + strategies) from a memory in one call.
 * This is the main entry point for the unified extraction pipeline.
 */
export declare function extractKnowledgeFromMemory(input: {
    memoryId: string;
    content: string;
    type: string;
    metadata?: Record<string, unknown> | null;
}, options?: ExtractionOptions): ExtractedKnowledge[];
/**
 * Extract ALL knowledge from a learning entry.
 */
export declare function extractKnowledgeFromLearning(learning: {
    content: string;
    type: string;
}, options?: ExtractionOptions): ExtractedKnowledge[];
//# sourceMappingURL=extractor.d.ts.map