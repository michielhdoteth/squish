/**
 * Two-stage duplicate detection orchestrator.
 * Stage 1: Hash-based prefiltering (SimHash + MinHash)
 * Stage 2: Semantic ranking using embeddings
 */
import type { Memory, MemoryType } from '../../../drizzle/schema.js';
import { analyzePair } from './semantic-ranker.js';
export interface MemoryPair {
    memory1: Memory;
    memory2: Memory;
    similarityScore: number;
    detectionMethod: 'simhash' | 'minhash' | 'embedding';
    confidenceLevel: 'high' | 'medium' | 'low';
    mergeReason: string;
}
export interface DetectionResult {
    candidates: MemoryPair[];
    stage1Time: number;
    stage2Time: number;
    totalCandidates: number;
    filteredCandidates: number;
    statistics: {
        totalMemories: number;
        memoriesByType: Record<MemoryType, number>;
    };
}
export interface DetectionOptions {
    projectId?: string;
    type?: MemoryType;
    threshold?: number;
    limit?: number;
    simhashThreshold?: number;
    minhashThreshold?: number;
    stage1Only?: boolean;
}
export declare function detectDuplicates(options: DetectionOptions): Promise<DetectionResult>;
export declare function analyzeMergePair(memoryId1: string, memoryId2: string): Promise<{
    memory1: Memory;
    memory2: Memory;
    analysis: ReturnType<typeof analyzePair>;
} | null>;
export declare function getDetectionStats(projectId: string): Promise<{
    totalMemories: number;
    mergeableMemories: number;
    mergedMemories: number;
    canonicalMemories: number;
    memoriesByType: Record<MemoryType, number>;
}>;
//# sourceMappingURL=two-stage-detector.d.ts.map