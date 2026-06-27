/**
 * Graph Boost v2 - BFS-based graph traversal for search result boosting
 *
 * Enhances search recall by 15-30% through graph traversal.
 * Uses BFS to traverse memory associations and calculates boost based on:
 * Boost = Σ(weight × coactivationCount × recencyBonus) / (depth +1)
 *
 * Features:
 * - Configurable max depth (default:2)
 * - Configurable minimum weight filter (default:0.3)
 * - Recency bonus (1.5x today, 1.2x yesterday, 1.0x after)
 * - Boost capping at 3.0x to prevent dominance
 * - Proper error handling and logging
 * - Supports in-memory graph backend
 */
import { GraphBackend } from '../graph/backend.js';
export interface GraphBoostParams {
    memoryId: string;
    projectId?: string;
    maxDepth?: number;
    minWeight?: number;
}
export interface GraphNode {
    id: string;
    weight: number;
    depth: number;
    associationType: string;
    coactivationCount: number;
    lastAccessedAt: string | Date;
}
/**
 * Get or create the graph backend instance (exported for testing)
 */
export declare function getGraphBackend(): Promise<GraphBackend>;
/**
 * Calculate graph boost for multiple memories using BFS traversal
 * Boost = Σ(weight × coactivationCount × recencyBonus) / (depth + 1)
 *
 * @param memoryIds - Array of memory IDs to calculate boost for
 * @param projectId - Optional project ID to filter associations
 * @param options - Configuration options (maxDepth, minWeight)
 * @returns Map of memory ID to boost value (capped at 3.0)
 */
export declare function calculateGraphBoost(memoryIds: string[], projectId?: string, options?: {
    maxDepth?: number;
    minWeight?: number;
}): Promise<Map<string, number>>;
/**
 * Calculate recency bonus based on last access time
 * - Today (< 1 day): 1.5x bonus
 * - Yesterday (1-2 days): 1.2x bonus
 * - Older (> 2 days): 1.0x (no bonus)
 *
 * @param lastAccessedAt - Date or date string of last access
 * @returns Multiplier value (1.0 - 1.5)
 */
export declare function calculateRecencyBonus(lastAccessedAt: string | Date): number;
/**
 * Wrapper function for backward compatibility with existing code
 * Computes graph boost and returns as Record<string, number>
 *
 * @deprecated Use calculateGraphBoost instead
 */
export declare function computeGraphBoost(memoryIds: string[]): Promise<Record<string, number>>;
//# sourceMappingURL=graph-boost.d.ts.map