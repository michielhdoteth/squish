import { describe, test, expect } from 'bun:test';
import { cosineSimilarity, dotProduct, DimensionMismatchError } from '../../core/utils/vector-operations.js';

describe('cosineSimilarity', () => {
  test('returns 0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  test('returns 0 for null or undefined inputs', () => {
    expect(cosineSimilarity(null as any, [])).toBe(0);
    expect(cosineSimilarity(undefined as any, [])).toBe(0);
    expect(cosineSimilarity([], null as any)).toBe(0);
    expect(cosineSimilarity(undefined as any, undefined as any)).toBe(0);
  });

  test('THROWS DimensionMismatchError for arrays of different lengths (Batch 4 policy)', () => {
    // Batch 4: cosine helpers never silently return 0 on dimension mismatch -
    // a mismatched comparison is a corpus bug and must surface.
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(DimensionMismatchError);
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(DimensionMismatchError);
    const err = (() => {
      try {
        cosineSimilarity([1, 2], [1, 2, 3]);
        return null;
      } catch (e) {
        return e as DimensionMismatchError;
      }
    })();
    expect(err).not.toBeNull();
    expect(err!.name).toBe('DimensionMismatchError');
    expect(err!.dimA).toBe(2);
    expect(err!.dimB).toBe(3);
  });

  test('dotProduct THROWS DimensionMismatchError on length mismatch', () => {
    expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(DimensionMismatchError);
    expect(dotProduct(null as any, [1])).toBe(0); // null inputs still yield 0
    expect(dotProduct([1, 2], null as any)).toBe(0);
  });

  test('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  test('calculates similarity for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 10);
  });

  test('calculates similarity for orthogonal vectors', () => {
    // [1, 0] and [0, 1] are orthogonal
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test('calculates similarity for opposite vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, [-1, -2, -3])).toBeCloseTo(-1, 10);
  });

  test('calculates similarity for proportional vectors', () => {
    // [1, 2, 3] and [2, 4, 6] are proportional (factor of 2)
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  test('handles single element vectors', () => {
    expect(cosineSimilarity([1], [1])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1], [-1])).toBeCloseTo(-1, 10);
    expect(cosineSimilarity([0], [1])).toBe(0);
  });

  test('handles floating point values correctly', () => {
    const a = [0.1, 0.2, 0.3];
    const b = [0.4, 0.5, 0.6];
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    // Verify it's the expected value
    const dot = 0.1*0.4 + 0.2*0.5 + 0.3*0.6; // 0.04 + 0.1 + 0.18 = 0.32
    const normA = Math.sqrt(0.01 + 0.04 + 0.09); // sqrt(0.14)
    const normB = Math.sqrt(0.16 + 0.25 + 0.36); // sqrt(0.57)
    expect(result).toBeCloseTo(dot / (normA * normB), 10);
  });

  test('handles large vectors', () => {
    const size = 1000;
    const a = Array.from({ length: size }, (_, i) => i + 1);
    const b = Array.from({ length: size }, (_, i) => (i + 1) * 2);
    const result = cosineSimilarity(a, b);
    expect(result).toBeCloseTo(1, 10); // proportional vectors
  });

  test('returns value in range [-1, 1] for valid inputs', () => {
    const testCases = [
      [[1, 2, 3], [4, 5, 6]],
      [[-1, 2, -3], [4, -5, 6]],
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]],
      [[-1, -2], [1, 2]],
    ];
    for (const [a, b] of testCases) {
      const result = cosineSimilarity(a as number[], b as number[]);
      // Allow small epsilon for floating point rounding
      expect(result).toBeGreaterThanOrEqual(-1 - 1e-10);
      expect(result).toBeLessThanOrEqual(1 + 1e-10);
    }
  });
});
