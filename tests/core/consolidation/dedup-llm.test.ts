/**
 * Tests for LLM-aware dedup in core/consolidation.ts
 * TDD: Write tests first, then implement
 * Tests exported pure functions (computeSimHash) without config mocking.
 */

import { describe, test, expect } from 'bun:test';

// Note: No mock.module() calls - avoid global mocking that pollutes other tests.
// Logger output is expected in test output.

describe('computeSimHash (exported for testing)', () => {
  test('identical text produces same hash', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash1 = computeSimHash('hello world');
    const hash2 = computeSimHash('hello world');
    expect(hash1).toBe(hash2);
  });

  test('similar text produces closer hashes than different text', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash1 = computeSimHash('The quick brown fox jumps over the lazy dog');
    const hash2 = computeSimHash('The quick brown fox jumps over the lazy cat');
    const hash3 = computeSimHash('Completely different text here');

    const hamming12 = hammingDistance(hash1, hash2);
    const hamming13 = hammingDistance(hash1, hash3);

    // Similar texts should have smaller Hamming distance
    expect(hamming12).toBeLessThan(hamming13);
  });

  test('empty text produces a hash', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash = computeSimHash('');
    expect(typeof hash).toBe('bigint');
  });

  test('single word produces a non-zero hash', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash = computeSimHash('test');
    expect(typeof hash).toBe('bigint');
    expect(hash).not.toBe(0n);
  });

  test('different texts produce different hashes', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash1 = computeSimHash('This is the first text sample');
    const hash2 = computeSimHash('This is the second text sample');
    expect(hash1).not.toBe(hash2);
  });

  test('case insensitive comparison', async () => {
    const { computeSimHash } = await import('../../../core/consolidation.js');
    const hash1 = computeSimHash('Hello World');
    const hash2 = computeSimHash('hello world');
    expect(hash1).toBe(hash2);
  });
});

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  while (xor !== 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}
