/**
 * Two-stage duplicate detection orchestrator
 *
 * Combines:
 * - Stage 1: Fast hash-based prefiltering (SimHash + MinHash)
 * - Stage 2: Semantic ranking using embeddings
 *
 * This is the main entry point for finding duplicate memories.
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
/**
 * Main entry point for two-stage duplicate detection
 *
 * Algorithm:
 * 1. Load all memories from database, optionally filtered by project/type
 * 2. Generate hashes for all memories (SimHash + MinHash)
 * 3. Stage 1: Find candidate pairs using hash-based prefilter
 * 4. Stage 2: Rank candidates by semantic similarity (embedding cosine)
 * 5. Return sorted list of detected duplicates
 *
 * @param options Detection configuration
 * @returns DetectionResult with candidate pairs and statistics
 */
export declare function detectDuplicates(options: DetectionOptions): Promise<DetectionResult>;
/**
 * Analyze a specific pair of memories for merge feasibility
 * Used for interactive merge previews
 */
export declare function analyzeMergePair(memoryId1: string, memoryId2: string): Promise<{
    memory1: Memory;
    memory2: Memory;
    analysis: ReturnType<typeof analyzePair>;
} | null>;
/**
 * Get detection statistics for a project
 */
export declare function getDetectionStats(projectId: string): Promise<{
    totalMemories: number;
    mergeableMemories: number;
    mergedMemories: number;
    canonicalMemories: number;
    memoriesByType: Record<MemoryType, number>;
}>;
//# sourceMappingURL=two-stage-detector.d.ts.map