/**
 * Semantic ranking using embeddings (Stage 2 of two-stage detection)
 *
 * Takes candidates from Stage 1 hash-based prefiltering and ranks them
 * by semantic similarity using cosine distance on embedding vectors.
 *
 * This is the expensive stage but runs on much smaller candidate set.
 */
import type { Memory } from '../../../drizzle/schema.js';
export interface RankedCandidate {
    memoryId1: string;
    memoryId2: string;
    memory1: Memory;
    memory2: Memory;
    cosineSimilarity: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    mergeReason: string;
}
/**
 * Rank stage 1 candidates using embedding similarity
 *
 * This is the expensive phase, running only on candidates that passed
 * the fast hash-based prefilter.
 *
 * @param candidates Candidate pairs from stage 1
 * @param memories Map of memoryId -> Memory object
 * @param embeddings Map of memoryId -> embedding vector
 * @param options Ranking options
 * @returns Sorted list of ranked candidates (highest similarity first)
 */
export declare function rankCandidates(candidates: Array<{
    memoryId1: string;
    memoryId2: string;
}>, memories: Map<string, Memory>, embeddings: Map<string, number[]>, options: {
    semanticThreshold?: number;
    topK?: number;
}): Promise<RankedCandidate[]>;
/**
 * Analyze a single pair of memories for semantic similarity
 * Useful for interactive merge previews
 */
export declare function analyzePair(memory1: Memory, memory2: Memory, embedding1: number[], embedding2: number[]): {
    cosineSimilarity: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    mergeReason: string;
    factors: {
        sameType: boolean;
        tagOverlap: number;
        contentLengthSimilarity: number;
    };
};
//# sourceMappingURL=semantic-ranker.d.ts.map