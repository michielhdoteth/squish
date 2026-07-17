/**
 * Consolidation Engine with Sleep Cycles
 * Implements dual-store (episodic buffer -> semantic graph) with periodic replay
 */
export interface ConsolidationConfig {
    enabled: boolean;
    sleepIntervalHours: number;
    minClusterSize: number;
    maxClusterSize: number;
    similarityThreshold: number;
    mergeConfidence: number;
}
export declare const DEFAULT_CONFIG: ConsolidationConfig;
/**
 * Run consolidation sleep cycle
 * 1. Cluster related memories (DBSCAN-like algorithm)
 * 2. Extract patterns from clusters
 * 3. Merge redundant memories
 * 4. Promote key facts to semantic layer
 */
export declare function runSleepCycle(projectId?: string, config?: Partial<ConsolidationConfig>): Promise<{
    clusters: number;
    merged: number;
    promoted: number;
    errors: string[];
}>;
/**
 * DBSCAN clustering on memories
 * (Simplified version - uses tag similarity)
 */
export declare function dbscanCluster(memories: any[], eps?: number, minPts?: number): any[][];
/**
 * Find neighbors of a memory based on tag similarity or embedding similarity.
 *
 * When useEmbeddings is true and embeddings are available, uses cosine similarity
 * instead of Jaccard tag overlap. Falls back to tag similarity if embeddings
 * are not available.
 *
 * @param target - The memory to find neighbors for
 * @param memories - Array of candidate memories
 * @param eps - Similarity threshold (0-1)
 * @param useEmbeddings - If true, try embedding-based similarity first
 * @returns Array of similar memories
 */
export declare function findNeighbors(target: any, memories: any[], eps: number, useEmbeddings?: boolean): any[];
/**
 * Extract pattern from a cluster of memories
 */
export declare function extractPattern(cluster: any[]): {
    summary: string;
    confidence: number;
    keyPoints: string[];
};
/**
 * Calculate content overlap between two strings using Jaccard similarity
 */
export declare function calculateOverlap(content1: string, content2: string): number;
//# sourceMappingURL=engine.d.ts.map