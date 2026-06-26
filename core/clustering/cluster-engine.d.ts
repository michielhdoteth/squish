/**
 * In-Memory Cluster Engine
 *
 * Manages memory clusters for geometry-aware consolidation.
 * Clusters are stored in-memory (not persisted) and are rebuilt
 * during consolidation runs.
 *
 * Each cluster tracks its member memory IDs and geometry stats.
 */
import type { ClusterGeometry } from '../lib/types.js';
/**
 * Clears all clusters (used for testing and re-initialization).
 */
export declare function clearClusters(): void;
/**
 * Finds the nearest cluster for a memory based on cosine similarity,
 * or creates a new cluster if none is close enough.
 *
 * The similarity threshold defaults to the consolidation similarity threshold
 * from config.
 *
 * @param memoryId - Memory ID to add to a cluster
 * @param embedding - Embedding vector for the memory
 * @param threshold - Similarity threshold (default from config)
 * @returns Cluster ID
 */
export declare function findOrCreateCluster(memoryId: string, embedding: number[], threshold?: number): Promise<string>;
/**
 * Updates the geometry statistics for a cluster.
 * Computes centroid, d_bar, d_eff, and other stats from the current
 * cluster members.
 *
 * @param clusterId - ID of the cluster to update
 * @returns Updated ClusterGeometry
 */
export declare function updateClusterStats(clusterId: string): Promise<ClusterGeometry>;
/**
 * Gets the current geometry for a cluster.
 *
 * @param clusterId - ID of the cluster
 * @returns ClusterGeometry if cluster exists, null otherwise
 */
export declare function getClusterGeometry(clusterId: string): Promise<ClusterGeometry | null>;
/**
 * Removes a memory from its cluster.
 * If the cluster becomes empty, it's removed.
 *
 * @param memoryId - ID of the memory to remove
 */
export declare function removeFromCluster(memoryId: string): Promise<void>;
/**
 * Gets all memories in a cluster.
 *
 * @param clusterId - ID of the cluster
 * @returns Array of memory IDs in the cluster
 */
export declare function getClusterMemories(clusterId: string): Promise<string[]>;
/**
 * Returns the current number of clusters.
 */
export declare function clusterCount(): number;
/**
 * Returns the cluster ID for a given memory, or null if not assigned.
 */
export declare function getClusterForMemory(memoryId: string): string | null;
/**
 * Returns all cluster IDs.
 */
export declare function getAllClusterIds(): string[];
//# sourceMappingURL=cluster-engine.d.ts.map