/**
 * Batch 5: graph boost normalization tests.
 *
 * Covers:
 * - Bounded in-set contribution (min-max normalization to 0..1)
 * - Log-scaled coactivation influence (hub dampening)
 * - Legacy escape hatch (SQUISH_GRAPH_BOOST_LEGACY)
 */

import { describe, test, expect } from 'bun:test';

import {
  logScaleCoactivation,
  normalizeGraphBoostMap,
  calculateGraphBoostNormalized,
  calculateRecencyBonus,
} from '../../../core/search/graph-boost.js';
import { getGraphBackend } from '../../../core/search/graph-boost.js';
import { getGraphBoostFlags } from '../../../core/retrieval/config.js';

describe('Graph Boost - normalizeGraphBoostMap (pure)', () => {
  test('returns empty map for empty input', () => {
    const out = normalizeGraphBoostMap(new Map());
    expect(out.size).toBe(0);
  });

  test('maps maximum contribution to exactly 1 and bounds all values to [0, 1]', () => {
    const raw = new Map([
      ['a', 5.0],
      ['b', 2.5],
      ['c', 0.0],
      ['d', 1.25],
    ]);
    const out = normalizeGraphBoostMap(raw);
    expect(out.get('a')).toBe(1);
    expect(out.get('b')).toBeCloseTo(0.5, 10);
    expect(out.get('d')).toBeCloseTo(0.25, 10);
    for (const v of out.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('unconnected candidates (raw 0) normalize to 0', () => {
    const raw = new Map([
      ['connected', 3.0],
      ['orphan', 0.0],
    ]);
    const out = normalizeGraphBoostMap(raw);
    expect(out.get('orphan')).toBe(0);
    expect(out.get('connected')).toBe(1);
  });

  test('uniform positive contributions yield all zeros (no differentiation signal)', () => {
    const raw = new Map([
      ['x', 4.2],
      ['y', 4.2],
      ['z', 4.2],
    ]);
    const out = normalizeGraphBoostMap(raw);
    for (const v of out.values()) expect(v).toBe(0);
  });

  test('all-zero input yields all zeros without division by zero', () => {
    const raw = new Map([
      ['x', 0],
      ['y', 0],
    ]);
    const out = normalizeGraphBoostMap(raw);
    expect(out.get('x')).toBe(0);
    expect(out.get('y')).toBe(0);
  });

  test('preserves raw ordering after normalization', () => {
    const raw = new Map([
      ['weak', 0.3],
      ['mid', 1.7],
      ['strong', 9.9],
    ]);
    const out = normalizeGraphBoostMap(raw);
    expect(out.get('strong')).toBeGreaterThan(out.get('mid')!);
    expect(out.get('mid')).toBeGreaterThan(out.get('weak')!);
  });
});

describe('Graph Boost - logScaleCoactivation', () => {
  test('zero count contributes zero', () => {
    expect(logScaleCoactivation(0)).toBe(0);
  });

  test('negative counts are clamped to zero contribution', () => {
    expect(logScaleCoactivation(-5)).toBe(0);
  });

  test('matches Math.log1p and is monotonic', () => {
    expect(logScaleCoactivation(1)).toBe(Math.log1p(1));
    expect(logScaleCoactivation(10)).toBe(Math.log1p(10));
    expect(logScaleCoactivation(100)).toBeGreaterThan(logScaleCoactivation(10));
    expect(logScaleCoactivation(1000)).toBeGreaterThan(logScaleCoactivation(100));
  });

  test('hub dampening: 10x coactivation no longer means 10x contribution', () => {
    // Linear ratio would be 10; log ratio must be far below it.
    const ratio = logScaleCoactivation(1000) / logScaleCoactivation(100);
    expect(ratio).toBeLessThan(1.5);
    expect(ratio).toBeGreaterThan(1); // still monotonic
  });

  test('single coactivation is not amplified away', () => {
    expect(logScaleCoactivation(1)).toBeGreaterThan(0.6);
  });
});

describe('Graph Boost - legacy escape hatch flag', () => {
  test('defaults to normalized mode (legacy=false)', () => {
    expect(getGraphBoostFlags({}).legacy).toBe(false);
  });

  test('SQUISH_GRAPH_BOOST_LEGACY=true restores legacy mode', () => {
    expect(getGraphBoostFlags({ SQUISH_GRAPH_BOOST_LEGACY: 'true' }).legacy).toBe(true);
    expect(getGraphBoostFlags({ SQUISH_GRAPH_BOOST_LEGACY: '1' }).legacy).toBe(true);
  });

  test('explicit false keeps normalized mode', () => {
    expect(getGraphBoostFlags({ SQUISH_GRAPH_BOOST_LEGACY: 'false' }).legacy).toBe(false);
  });
});

describe('Graph Boost - calculateGraphBoostNormalized (integration)', () => {
  test('bounded in-set contributions over an in-memory graph', async () => {
    const backend = await getGraphBackend();
    const now = new Date().toISOString();

    // Directed edges: a is the hub, c is mid, b/d have no outgoing edges.
    await backend.createEdge('nb5-a', 'nb5-b', { weight: 1.0, coactivationCount: 100, lastAccessedAt: now, associationType: 'relates_to' });
    await backend.createEdge('nb5-a', 'nb5-c', { weight: 1.0, coactivationCount: 10, lastAccessedAt: now, associationType: 'relates_to' });
    await backend.createEdge('nb5-c', 'nb5-d', { weight: 1.0, coactivationCount: 5, lastAccessedAt: now, associationType: 'relates_to' });

    const { normalized, raw } = await calculateGraphBoostNormalized(['nb5-a', 'nb5-b', 'nb5-c', 'nb5-d']);

    expect(normalized.size).toBe(4);

    // Hub candidate normalizes to exactly 1
    expect(normalized.get('nb5-a')).toBe(1);

    // Unconnected candidates contribute nothing
    expect(normalized.get('nb5-b')).toBe(0);
    expect(normalized.get('nb5-d')).toBe(0);

    // Mid-connected candidate lands strictly inside [0, 1]
    const mid = normalized.get('nb5-c')!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    // Normalization preserves raw ordering
    expect(normalized.get('nb5-a')!).toBeGreaterThanOrEqual(mid);

    // Raw sums are finite, non-negative, and uncapped beyond the legacy 3.0 cap
    for (const v of raw.values()) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  test('log scaling visibly dampens hub coactivation vs legacy raw boost', async () => {
    const backend = await getGraphBackend();
    const now = new Date().toISOString();

    // Two candidates each with one edge; identical except coactivation count.
    await backend.createEdge('lg-x', 'lg-x2', { weight: 1.0, coactivationCount: 10000, lastAccessedAt: now, associationType: 'relates_to' });
    await backend.createEdge('lg-y', 'lg-y2', { weight: 1.0, coactivationCount: 100, lastAccessedAt: now, associationType: 'relates_to' });

    const { raw } = await calculateGraphBoostNormalized(['lg-x', 'lg-y']);
    const rx = raw.get('lg-x')!;
    const ry = raw.get('lg-y')!;

    // Linear would give a 10000/100 = 100x gap; log must compress it hard.
    expect(rx / ry).toBeLessThan(3);
    expect(rx).toBeGreaterThan(ry); // still monotonic
  });

  test('empty candidate set returns empty maps', async () => {
    const { normalized, raw } = await calculateGraphBoostNormalized([]);
    expect(normalized.size).toBe(0);
    expect(raw.size).toBe(0);
  });
});

describe('Graph Boost - recency bonus unchanged by Batch 5', () => {
  test('recency bonus semantics preserved', () => {
    expect(calculateRecencyBonus(new Date())).toBe(1.5);
    expect(calculateRecencyBonus(new Date(Date.now() - 36 * 3600 * 1000))).toBe(1.2);
    expect(calculateRecencyBonus(new Date(Date.now() - 72 * 3600 * 1000))).toBe(1.0);
  });
});
