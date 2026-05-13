/**
 * Geometry Utilities for Memory Consolidation
 *
 * Provides mathematical functions to measure cluster geometry and determine
 * whether a memory cluster is safe to compress.
 *
 * Core principle: Before consolidating a cluster, measure whether it's
 * geometrically safe: compute mean within-cluster cosine distance (d_bar)
 * and local effective dimension (d_eff). If d_bar < theta_prime (default 0.15),
 * consolidation is safe.
 */

import {
  cosineSimilarity,
  vectorMean,
  covarianceMatrix,
  powerIteration,
  matrixTrace,
} from '../utils/vector-operations.js';

/**
 * Computes the centroid (mean embedding vector) of a set of vectors.
 *
 * @param vectors - Array of embedding vectors
 * @returns Mean vector (centroid)
 * @throws If vectors have inconsistent dimensions
 */
export function computeCentroid(vectors: number[][]): number[] {
  return vectorMean(vectors);
}

/**
 * Computes the mean within-cluster cosine distance from centroid.
 * d_bar = mean(1 - cosineSimilarity(v_i, centroid)) for all v_i in cluster.
 *
 * @param vectors - Array of embedding vectors in the cluster
 * @param centroid - The centroid vector of the cluster
 * @returns Mean cosine distance (d_bar), 0 for empty or single-vector clusters
 */
export function computeMeanCosineDistance(vectors: number[][], centroid: number[]): number {
  if (vectors.length === 0) return 0;

  let totalDistance = 0;
  for (let i = 0; i < vectors.length; i++) {
    const similarity = cosineSimilarity(vectors[i], centroid);
    totalDistance += 1 - similarity;
  }

  return totalDistance / vectors.length;
}

/**
 * Estimates the local effective dimension of a cluster via eigenvalue-based
 * approximation.
 *
 * Uses the ratio of total variance (trace of covariance matrix) to the
 * dominant eigenvalue (power iteration). This approach is more numerically
 * stable than computing all eigenvalues.
 *
 * Steps:
 * 1. Compute covariance matrix
 * 2. Compute trace = sum of diagonal elements = total variance
 * 3. Compute dominant eigenvalue via power iteration
 * 4. Return trace / max_eigenvalue as effective dimension
 *
 * Falls back to 1 for tiny clusters (< 2 vectors).
 *
 * @param vectors - Array of embedding vectors in the cluster
 * @returns Estimated effective dimension (>= 1)
 */
export function estimateEffectiveDimension(vectors: number[][]): number {
  // Fallback for tiny clusters
  if (vectors.length < 2) return 1;

  const dim = vectors[0].length;

  let totalVariance: number;
  let dominantEigenvalue: number;

  if (vectors.length <= dim) {
    // Use the Gram matrix approach when n < p (fewer samples than dimensions)
    // Center the vectors
    const centered = vectors.map((v, _, arr) => {
      const mean = vectorMean(arr);
      return v.map((val, i) => val - mean[i]);
    });

    const n = centered.length;
    const gram: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let dot = 0;
        for (let k = 0; k < dim; k++) {
          dot += centered[i][k] * centered[j][k];
        }
        gram[i][j] = dot / (n - 1);
        if (i !== j) gram[j][i] = dot / (n - 1);
      }
    }

    totalVariance = matrixTrace(gram);
    dominantEigenvalue = powerIteration(gram);
  } else {
    // Standard approach: compute covariance matrix
    const cov = covarianceMatrix(vectors);
    if (cov.length === 0) return 1;

    totalVariance = matrixTrace(cov);
    dominantEigenvalue = powerIteration(cov);
  }

  // Handle edge cases
  if (!Number.isFinite(totalVariance) || totalVariance <= 0) return 1;
  if (!Number.isFinite(dominantEigenvalue) || dominantEigenvalue <= 0) {
    // Fallback: if power iteration fails, use total variance as estimate
    return Math.max(1, Math.min(dim, vectors.length));
  }

  // Effective dimension = totalVariance / max_eigenvalue
  return Math.max(1, totalVariance / dominantEigenvalue);
}

/**
 * Performs a compression safety test on a cluster.
 *
 * If d_bar < thetaPrime: consolidation is safe (cluster is tight).
 * If d_bar >= thetaPrime: cluster is too diverse, consolidation may lose information.
 *
 * Recommended representatives = ceil(exp(d_eff * 0.5))
 * This scales the number of representatives with the effective dimension.
 *
 * @param dBar - Mean within-cluster cosine distance
 * @param dEff - Estimated effective dimension
 * @param thetaPrime - Safety threshold (default 0.15)
 * @returns { safe, recommendedRepresentatives, reason }
 */
export function compressionSafetyTest(
  dBar: number,
  dEff: number,
  thetaPrime: number
): { safe: boolean; recommendedRepresentatives: number; reason: string } {
  const recommendedRepresentatives = Math.max(1, Math.ceil(Math.exp(dEff * 0.5)));
  const safe = dBar < thetaPrime;

  let reason: string;
  if (safe) {
    reason = `safe: d_bar=${dBar.toFixed(4)} < theta=${thetaPrime}, ` +
      `recommend ${recommendedRepresentatives} representative(s)`;
  } else {
    reason = `unsafe: d_bar=${dBar.toFixed(4)} >= theta=${thetaPrime}, ` +
      `cluster too diverse for safe consolidation, recommend splitting or skipping`;
  }

  return { safe, recommendedRepresentatives, reason };
}

/**
 * Returns the cluster spread measure, which is the mean within-cluster
 * cosine distance (d_bar).
 *
 * This is an alias for computeMeanCosineDistance that takes only vectors
 * (computes centroid internally).
 *
 * @param vectors - Array of embedding vectors in the cluster
 * @returns Cluster spread measure (d_bar)
 */
export function clusterSpread(vectors: number[][]): number {
  if (vectors.length === 0) return 0;
  const centroid = computeCentroid(vectors);
  if (centroid.length === 0) return 0;
  return computeMeanCosineDistance(vectors, centroid);
}
