/**
 * Memory Consolidation System
 * Implements experience replay and memory consolidation with geometry-aware compression.
 *
 * Before consolidating a cluster, the system checks whether it's geometrically safe:
 * - Computes d_bar (mean within-cluster cosine distance)
 * - Computes d_eff (effective dimension via PCA eigenvalue ratio)
 * - If d_bar < theta_prime: consolidation is safe (cluster is tight)
 * - If d_bar >= theta_prime: cluster is too diverse, skip or split
 *
 * Falls back to extractive summary if geometry is disabled.
 */
export interface ConsolidationOptions {
    projectId: string;
    minAge?: number;
    maxImportance?: number;
    minClusterSize?: number;
    similarityThreshold?: number;
    limit?: number;
}
export interface ConsolidationResult {
    consolidatedMemoryId: string;
    sourceMemoryIds: string[];
    clusterSize: number;
    summary: string;
    geometrySafe?: boolean;
    dBar?: number;
    dEff?: number;
}
export interface ClusterResult {
    memories: any[];
    similarity: number;
    representativeId: string;
}
/**
 * Main consolidation function - consolidates low-importance old memories
 */
export declare function consolidateMemories(options: ConsolidationOptions): Promise<ConsolidationResult[]>;
/**
 * Generate extractive summary from a cluster of memories
 * Uses text processing without requiring an LLM
 * Exported for testing; used internally by generateClusterSummary().
 */
export declare function generateExtractiveSummary(memories: any[]): string;
/**
 * Generate a cluster summary.
 * Uses LLM when available and enabled, falls back to extractive summary.
 * LLM is always optional - never blocks, never throws.
 * Exported for testing; use consolidateCluster() for production.
 */
export declare function generateClusterSummary(memories: any[]): Promise<string>;
/**
 * Truncate text to maximum length
 * Exported for testing.
 */
export declare function truncate(text: string, maxLength: number): string;
/**
 * Reverse consolidation - restore original memories
 * This allows undoing consolidation if needed
 */
export declare function reverseConsolidation(consolidatedMemoryId: string): Promise<void>;
/**
 * Get consolidation statistics for a project
 */
export declare function getConsolidationStats(projectId: string): Promise<{
    totalMemories: number;
    consolidatedMemories: number;
    consolidationsCreated: number;
    avgClusterSize: number;
}>;
//# sourceMappingURL=consolidation.d.ts.map