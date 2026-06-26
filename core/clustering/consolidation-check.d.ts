/**
 * Consolidation Safety Check
 *
 * Evaluates memory clusters for compression safety using geometry-aware metrics.
 * Before consolidating a cluster, measure d_bar (mean within-cluster cosine distance)
 * and d_eff (effective dimension) to determine if compression is safe.
 */
import type { ConsolidationDecision } from '../lib/types.js';
/**
 * Evaluates a cluster for compression safety.
 *
 * Computes d_bar and d_eff, then runs the compression safety test.
 * Returns a ConsolidationDecision with safeToCompress, recommendedRepresentatives,
 * reason, dBar, and dEff.
 *
 * @param clusterId - ID of the cluster to evaluate
 * @returns ConsolidationDecision
 */
export declare function evaluateCluster(clusterId: string): Promise<ConsolidationDecision>;
/**
 * Quick boolean check: should this cluster be consolidated?
 *
 * @param clusterId - ID of the cluster to check
 * @returns True if the cluster is safe to consolidate
 */
export declare function shouldConsolidate(clusterId: string): Promise<boolean>;
/**
 * Should this cluster be split into sub-clusters?
 * A cluster should be split when it's diverse (unsafe to compress)
 * and has enough members to form meaningful sub-clusters.
 *
 * @param clusterId - ID of the cluster to check
 * @returns True if the cluster should be split
 */
export declare function shouldSplit(clusterId: string): Promise<boolean>;
/**
 * Recommends how many representatives to preserve for a cluster.
 *
 * @param clusterId - ID of the cluster
 * @returns Number of representatives to preserve
 */
export declare function recommendRepresentatives(clusterId: string): Promise<number>;
export { compressionSafetyTest as runSafetyTest } from './geometry.js';
//# sourceMappingURL=consolidation-check.d.ts.map