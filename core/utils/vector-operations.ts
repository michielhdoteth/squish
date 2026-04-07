/**
 * Vector Operations Utilities
 *
 * Provides mathematical operations for vector computations, primarily focused on
 * cosine similarity calculations for embedding comparisons.
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
