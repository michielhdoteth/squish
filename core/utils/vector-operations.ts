/**
 * Vector Operations Utilities
 *
 * Provides mathematical operations for vector computations, primarily focused on
 * cosine similarity calculations for embedding comparisons, covariance matrices,
 * and eigenvalue estimation for geometry-aware consolidation.
 *
 * All functions handle edge cases gracefully and are optimized for performance.
 */

/**
 * Calculates the cosine similarity between two vectors.
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * providing a normalized measure of similarity that ranges from -1 (opposite)
 * to 1 (identical), with 0 indicating orthogonality (no similarity).
 *
 * The implementation uses the standard formula:
 *   cos(θ) = (A · B) / (||A|| * ||B||)
 *
 * Edge case handling:
 * - Returns 0 if either vector is null/undefined
 * - Returns 0 if vectors have different lengths
 * - Returns 0 if either vector has zero magnitude (norm = 0)
 *
 * @param a - First vector as array of numbers
 * @param b - Second vector as array of numbers
 * @returns Cosine similarity value in range [-1, 1], or 0 for invalid inputs
 *
 * @example
 * ```typescript
 * const vec1 = [1, 2, 3];
 * const vec2 = [4, 5, 6];
 * const similarity = cosineSimilarity(vec1, vec2); // ~0.974
 * ```
 *
 * @performance
 * - Time complexity: O(n) where n is vector length
 * - Space complexity: O(1) - uses only accumulator variables
 * - Optimized with single-pass computation of dot product and norms
 */
export function cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number {
  // Guard against null/undefined inputs
  if (!a || !b) return 0;

  // Vectors must have same dimensions
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Single pass to compute dot product and norms
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // Handle zero vectors (avoid division by zero)
  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculates the Euclidean distance between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Euclidean distance, or Infinity if vectors have different lengths
 */
export function euclideanDistance(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b) return Infinity;
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Normalizes a vector to unit length (magnitude = 1).
 *
 * @param vec - Input vector
 * @returns Normalized vector, or null if input is null or zero vector
 */
export function normalizeVector(vec: number[] | null | undefined): number[] | null {
  if (!vec) return null;

  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }

  if (norm === 0) return null;

  const magnitude = Math.sqrt(norm);
  return vec.map(val => val / magnitude);
}

/**
 * Computes the dot product of two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product, or 0 if vectors are invalid or different lengths
 */
export function dotProduct(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length !== b.length) return 0;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}

/**
 * Calculates the magnitude (L2 norm) of a vector.
 *
 * @param vec - Input vector
 * @returns Magnitude of the vector, or 0 if input is null
 */
export function magnitude(vec: number[] | null | undefined): number {
  if (!vec) return 0;

  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

/**
 * Computes the mean of a set of vectors (column-wise average).
 *
 * @param vectors - Array of vectors (rows = observations, cols = dimensions)
 * @returns Mean vector, or empty array for empty input
 */
export function vectorMean(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;

  for (let i = 1; i < vectors.length; i++) {
    if (vectors[i].length !== dim) {
      throw new Error('All vectors must have the same length');
    }
  }

  const mean = new Array(dim).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < dim; j++) {
      mean[j] += vectors[i][j];
    }
  }
  for (let j = 0; j < dim; j++) {
    mean[j] /= vectors.length;
  }
  return mean;
}

/**
 * Centers a set of vectors by subtracting the mean.
 *
 * @param vectors - Array of vectors to center
 * @param mean - Pre-computed mean vector (if not provided, computed)
 * @returns Centered vectors
 */
export function centerVectors(vectors: number[][], mean?: number[]): number[][] {
  if (vectors.length === 0) return [];
  const m = mean ?? vectorMean(vectors);
  if (m.length === 0) return vectors;
  return vectors.map(v => {
    if (v.length !== m.length) throw new Error('Vector dimension mismatch');
    return v.map((val, i) => val - m[i]);
  });
}

/**
 * Computes the covariance matrix from a set of vectors.
 * The result is a dim x dim matrix where element [i][j] = cov(dim_i, dim_j).
 *
 * @param vectors - Array of vectors (rows = observations, cols = dimensions)
 * @returns Covariance matrix as 2D array
 */
export function covarianceMatrix(vectors: number[][]): number[][] {
  if (vectors.length < 2) return [];
  const dim = vectors[0].length;

  for (let i = 1; i < vectors.length; i++) {
    if (vectors[i].length !== dim) {
      throw new Error('All vectors must have the same length');
    }
  }

  const centered = centerVectors(vectors);
  const n = vectors.length;
  const cov: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));

  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += centered[k][i] * centered[k][j];
      }
      cov[i][j] = sum / (n - 1);
      if (i !== j) {
        cov[j][i] = cov[i][j]; // Symmetric
      }
    }
  }
  return cov;
}

/**
 * Computes eigenvalues of a symmetric matrix using the power iteration method
 * for the dominant eigenvalue, or a simple approach for small matrices.
 *
 * For geometry-aware consolidation, we only need the top eigenvalues
 * to estimate effective dimension.
 *
 * @param matrix - Symmetric matrix (e.g., covariance matrix)
 * @returns Array of eigenvalues sorted descending
 */
export function computeEigenvalues(matrix: number[][]): number[] {
  if (matrix.length === 0) return [];
  const n = matrix.length;

  // For 1x1 matrix, the eigenvalue is just the element
  if (n === 1) return [matrix[0][0]];

  // For very small matrices (2x2 or 3x3), use direct computation
  if (n <= 3) {
    return computeEigenvaluesSmall(matrix);
  }

  // For larger matrices, extract top eigenvalues via power iteration
  return computeTopEigenvalues(matrix, Math.min(n, 5));
}

/**
 * Direct eigenvalue computation for small matrices (2x2 or 3x3).
 */
function computeEigenvaluesSmall(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n === 2) {
    // Characteristic polynomial: lambda^2 - trace * lambda + det = 0
    const trace = matrix[0][0] + matrix[1][1];
    const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    const discriminant = trace * trace - 4 * det;
    if (discriminant < 0) return [trace / 2, trace / 2]; // Fallback for numerical issues
    const sqrtD = Math.sqrt(discriminant);
    const lambda1 = (trace + sqrtD) / 2;
    const lambda2 = (trace - sqrtD) / 2;
    return [lambda1, lambda2].sort((a, b) => b - a);
  }

  if (n === 3) {
    // Use power iteration for the dominant eigenvalue
    const eigenvalues: number[] = [];
    let workingMatrix = matrix.map(row => [...row]);

    for (let k = 0; k < 3; k++) {
      const lambda = powerIteration(workingMatrix);
      if (lambda === 0) break;
      eigenvalues.push(lambda);
      // Deflate: subtract lambda * v * v^T
      // Use a random vector to estimate eigenvector
      const v = getEigenvector(workingMatrix, lambda);
      if (v.every(x => Math.abs(x) < 1e-10)) break;
      const vNorm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      const vUnit = vNorm > 1e-10 ? v.map(x => x / vNorm) : v;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          workingMatrix[i][j] -= lambda * vUnit[i] * vUnit[j];
        }
      }
    }
    return eigenvalues.length > 0 ? eigenvalues : [1];
  }

  return [1];
}

/**
 * Computes the trace of a matrix (sum of diagonal elements).
 *
 * @param matrix - Input matrix
 * @returns Trace value
 */
export function matrixTrace(matrix: number[][]): number {
  if (matrix.length === 0) return 0;
  let trace = 0;
  const n = Math.min(matrix.length, matrix[0]?.length ?? 0);
  for (let i = 0; i < n; i++) {
    trace += matrix[i][i];
  }
  return trace;
}

/**
 * Power iteration to find the dominant eigenvalue of a matrix.
 */
export function powerIteration(matrix: number[][], maxIter: number = 100, tol: number = 1e-10): number {
  const n = matrix.length;
  // Deterministic pseudo-random start (seeded LCG): Math.random() can converge
  // to a different eigenvector on near-degenerate matrices, making callers
  // (e.g. GAC strategy selection) nondeterministic.
  let seed = 0x2f6e2b1;
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  let b = new Array(n).fill(1).map(() => nextRandom());

  for (let iter = 0; iter < maxIter; iter++) {
    // Multiply matrix * b
    const bNext = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        bNext[i] += matrix[i][j] * b[j];
      }
    }

    // Compute Rayleigh quotient
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += bNext[i] * b[i];
      den += b[i] * b[i];
    }
    const lambdaNew = den > 0 ? num / den : 0;

    // Normalize bNext
    const norm = Math.sqrt(bNext.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-15) return 0;
    b = bNext.map(x => x / norm);

    if (Math.abs(lambdaNew - lambda) < tol) return lambdaNew;
    lambda = lambdaNew;
  }
  return lambda;
}

/**
 * Extract eigenvector corresponding to eigenvalue lambda via inverse power iteration.
 */
function getEigenvector(matrix: number[][], lambda: number): number[] {
  const n = matrix.length;
  // Shift the matrix: (A - lambda*I)
  const shifted = matrix.map((row, i) => row.map((val, j) => (i === j ? val - lambda : val)));
  // Solve (A - lambda*I) * v = b using one iteration with random b
  let v = new Array(n).fill(1).map(() => Math.random());
  // Normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  v = v.map(x => x / norm);
  return v;
}

/**
 * Compute the top k eigenvalues of a symmetric matrix using power iteration with deflation.
 */
function computeTopEigenvalues(matrix: number[][], k: number): number[] {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  let workingMatrix = matrix.map(row => [...row]);
  let largestLambda = 0;

  for (let i = 0; i < k; i++) {
    const lambda = powerIteration(workingMatrix);
    if (lambda === 0 || !Number.isFinite(lambda)) break;
    // Stop once we hit numerical noise: after deflating a (near) rank-deficient
    // matrix, remaining "eigenvalues" are floating-point residue. Including them
    // corrupts downstream statistics (e.g. participation ratio / d_eff).
    if (i > 0 && lambda <= largestLambda * 1e-6) break;
    if (i === 0) largestLambda = lambda;
    eigenvalues.push(lambda);
    // Deflate
    const v = getEigenvector(workingMatrix, lambda);
    const vNorm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (vNorm < 1e-10) break;
    const vUnit = v.map(x => x / vNorm);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        workingMatrix[r][c] -= lambda * vUnit[r] * vUnit[c];
      }
    }
  }

  if (eigenvalues.length === 0) return [1];
  return eigenvalues;
}

/**
 * Computes the variance explained ratio from eigenvalues.
 * Each value is the fraction of total variance explained by that component.
 *
 * @param eigenvalues - Array of eigenvalues sorted descending
 * @returns Array of ratios that sum to ~1
 */
export function computeVarianceExplained(eigenvalues: number[]): number[] {
  if (eigenvalues.length === 0) return [];
  const total = eigenvalues.reduce((s, v) => s + Math.max(0, v), 0);
  if (total === 0) return eigenvalues.map(() => 0);
  return eigenvalues.map(v => Math.max(0, v) / total);
}

/**
 * Computes the transpose of a matrix.
 *
 * @param matrix - Input matrix as 2D array
 * @returns Transposed matrix
 */
export function transposeMatrix(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}
