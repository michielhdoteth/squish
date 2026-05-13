/**
 * Consolidation Safety Check
 *
 * Evaluates memory clusters for compression safety using geometry-aware metrics.
 * Before consolidating a cluster, measure d_bar (mean within-cluster cosine distance)
 * and d_eff (effective dimension) to determine if compression is safe.
 */

import { config } from '../../config.js';
import { logger } from '../logger.js';
import type { ConsolidationDecision } from '../lib/types.js';
import { getClusterGeometry } from './cluster-engine.js';
import { compressionSafetyTest } from './geometry.js';

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
export async function evaluateCluster(clusterId: string): Promise<ConsolidationDecision> {
  const geometry = await getClusterGeometry(clusterId);

  if (!geometry) {
    return {
      safeToCompress: false,
      recommendedRepresentatives: 1,
      reason: 'cluster not found',
      dBar: 0,
      dEff: 1,
    };
  }

  // Refuse to consolidate clusters below minimum size
  if (geometry.n < config.consolidationGeometryMinClusterSize) {
    return {
      safeToCompress: false,
      recommendedRepresentatives: geometry.n,
      reason: `cluster too small (n=${geometry.n} < min=${config.consolidationGeometryMinClusterSize})`,
      dBar: geometry.dBar,
      dEff: geometry.dEff,
    };
  }

  // Perform the compression safety test
  const testResult = compressionSafetyTest(
    geometry.dBar,
    geometry.dEff,
    geometry.thetaPrime
  );

  logger.debug(`Cluster ${clusterId} evaluation: d_bar=${geometry.dBar.toFixed(4)}, ` +
    `d_eff=${geometry.dEff.toFixed(2)}, safe=${testResult.safe}`);

  return {
    safeToCompress: testResult.safe,
    recommendedRepresentatives: testResult.recommendedRepresentatives,
    reason: testResult.reason,
    dBar: geometry.dBar,
    dEff: geometry.dEff,
  };
}

/**
 * Quick boolean check: should this cluster be consolidated?
 *
 * @param clusterId - ID of the cluster to check
 * @returns True if the cluster is safe to consolidate
 */
export async function shouldConsolidate(clusterId: string): Promise<boolean> {
  if (!config.consolidationGeometryEnabled) return false;
  const decision = await evaluateCluster(clusterId);
  return decision.safeToCompress;
}

/**
 * Should this cluster be split into sub-clusters?
 * A cluster should be split when it's diverse (unsafe to compress)
 * and has enough members to form meaningful sub-clusters.
 *
 * @param clusterId - ID of the cluster to check
 * @returns True if the cluster should be split
 */
export async function shouldSplit(clusterId: string): Promise<boolean> {
  if (!config.consolidationGeometryAutoSplit) return false;

  const geometry = await getClusterGeometry(clusterId);
  if (!geometry) return false;

  // Need enough members to split
  if (geometry.n < config.consolidationGeometryMinClusterSize * 2) return false;

  // Check if unsafe (too diverse)
  const decision = await evaluateCluster(clusterId);
  return !decision.safeToCompress;
}

/**
 * Recommends how many representatives to preserve for a cluster.
 *
 * @param clusterId - ID of the cluster
 * @returns Number of representatives to preserve
 */
export async function recommendRepresentatives(clusterId: string): Promise<number> {
  const geometry = await getClusterGeometry(clusterId);
  if (!geometry) return 1;

  const testResult = compressionSafetyTest(
    geometry.dBar,
    geometry.dEff,
    geometry.thetaPrime
  );

  return testResult.recommendedRepresentatives;
}

export { compressionSafetyTest as runSafetyTest } from './geometry.js';
