/**
 * Semantic ranking using embeddings (Stage 2 of two-stage detection).
 * Ranks candidates from Stage 1 by semantic similarity using cosine distance.
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
export declare function rankCandidates(candidates: Array<{
    memoryId1: string;
    memoryId2: string;
}>, memories: Map<string, Memory>, embeddings: Map<string, number[]>, options: {
    semanticThreshold?: number;
    topK?: number;
}): Promise<RankedCandidate[]>;
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