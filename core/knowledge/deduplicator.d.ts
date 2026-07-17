/**
 * Unified Knowledge Deduplicator
 *
 * Detects and merges duplicate knowledge across all kinds.
 * Uses Jaccard similarity on content, then merges by superseding the weaker record.
 */
import type { KnowledgeKind, Knowledge } from './types.js';
/**
 * Find similar knowledge records to a given input.
 * Returns records with similarity scores above the threshold.
 */
export declare function findSimilarKnowledge(input: Knowledge, threshold?: number): Promise<Array<Knowledge & {
    similarity: number;
}>>;
/**
 * Batch deduplicate knowledge within a project for a given kind.
 * Finds groups of similar records (similarity > threshold) and merges them,
 * keeping the one with the highest confidence.
 */
export declare function deduplicateKnowledge(kind: KnowledgeKind, projectId?: string, threshold?: number): Promise<{
    merged: number;
    kept: string[];
}>;
/**
 * Run deduplication for all knowledge kinds in a project.
 * This is called during the sleep cycle / consolidation.
 */
export declare function runDeduplicationCycle(projectId?: string): Promise<{
    memories: {
        merged: number;
        kept: string[];
    };
    beliefs: {
        merged: number;
        kept: string[];
    };
    strategies: {
        merged: number;
        kept: string[];
    };
}>;
//# sourceMappingURL=deduplicator.d.ts.map