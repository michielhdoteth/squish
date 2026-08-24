/**
 * Batch 3-5 review: legacy graph-boost hatch must be BYTE-COMPATIBLE with the
 * pre-Batch-5 behavior, not just qualitatively similar.
 *
 * Pre-B5 formula: served delta = min(rawCappedSum, 3.0) x 0.2  (max +0.60).
 * Batch 5 halved the config default weight to 0.10 for the normalized mode,
 * which silently capped the legacy hatch at +0.30. The fix restores effective
 * weight 0.2 under SQUISH_GRAPH_BOOST_LEGACY=true unless
 * SQUISH_WEIGHT_GRAPH_BOOST is set explicitly.
 */

import { describe, test, expect, afterEach } from 'bun:test';

import {
  LEGACY_GRAPH_BOOST_WEIGHT,
  effectiveGraphBoostWeight,
} from '../../../core/search/graph-boost.js';
import { applyGraphBoostWithWeight } from '../../../core/memory/search-scoring.js';
import { initScoreFields } from '../../../core/scoring/three-field.js';
import { config } from '../../../config.js';

const WEIGHT_KEY = 'SQUISH_WEIGHT_GRAPH_BOOST';
let savedWeight: string | undefined;

afterEach(() => {
  if (savedWeight === undefined) delete process.env[WEIGHT_KEY];
  else process.env[WEIGHT_KEY] = savedWeight;
  savedWeight = undefined;
});

function makeResult(id: string, semantic: number) {
  // Shape results exactly as the pipeline does right before graph boost:
  // similarity aliases the honest semantic score, boosts still zero.
  return initScoreFields([
    { id, content: `content-${id}`, type: 'note', similarity: semantic } as any,
  ])[0];
}

describe('Legacy graph boost hatch - byte compatibility', () => {
  test('LEGACY_GRAPH_BOOST_WEIGHT is the pre-Batch-5 0.2', () => {
    expect(LEGACY_GRAPH_BOOST_WEIGHT).toBe(0.2);
  });

  test('legacy mode restores effective weight 0.2 when env unset', () => {
    delete process.env[WEIGHT_KEY];
    expect(effectiveGraphBoostWeight(true)).toBe(0.2);
  });

  test('normalized mode keeps the Batch 5 config default 0.10 when env unset', () => {
    delete process.env[WEIGHT_KEY];
    expect(effectiveGraphBoostWeight(false)).toBe(config.scoringWeights.graphBoost);
    expect(effectiveGraphBoostWeight(false)).toBe(0.10);
  });

  test('explicit SQUISH_WEIGHT_GRAPH_BOOST wins in BOTH modes', () => {
    process.env[WEIGHT_KEY] = '0.35';
    expect(effectiveGraphBoostWeight(true)).toBe(0.35);
    expect(effectiveGraphBoostWeight(false)).toBe(0.35);
  });

  test('junk SQUISH_WEIGHT_GRAPH_BOOST falls back to mode defaults', () => {
    process.env[WEIGHT_KEY] = 'not-a-number';
    expect(effectiveGraphBoostWeight(true)).toBe(0.2);
    expect(effectiveGraphBoostWeight(false)).toBe(0.10);
  });

  test('legacy-mode served scores match the pre-B5 formula exactly', () => {
    delete process.env[WEIGHT_KEY];
    const base = 0.9;
    const rawSum = 3.0; // legacy cap: raw sums above this are clamped to 3.0
    const result = makeResult('mem-a', base);

    const [served] = applyGraphBoostWithWeight(
      [result],
      { 'mem-a': rawSum },
      10,
      effectiveGraphBoostWeight(true)
    );

    const expectedDelta = Math.min(rawSum, 3.0) * 0.2;
    // Mid-pipeline composite accumulates unclamped, byte-for-byte as pre-B5.
    expect(served.similarity).toBe(base + expectedDelta);
    expect(served.similarity).toBe(1.5); // 0.9 + 0.6, the legacy maximum
    // Three-field identity holds: itemized boost + clamped finalScore.
    expect(served.scoreBreakdown?.graph).toBeCloseTo(expectedDelta, 12);
    expect(served.finalScore).toBe(1); // clamp01(1.5)
  });

  test('legacy-mode sub-cap scores match pre-B5 formula too', () => {
    delete process.env[WEIGHT_KEY];
    const base = 0.42;
    const rawSum = 1.7; // below the 3.0 cap -> uncapped
    const result = makeResult('mem-b', base);

    const [served] = applyGraphBoostWithWeight(
      [result],
      { 'mem-b': rawSum },
      10,
      effectiveGraphBoostWeight(true)
    );

    expect(served.similarity).toBe(base + rawSum * 0.2); // 0.42 + 0.34 = 0.76
  });

  test('normalized mode stays bounded by the Batch 5 weight', () => {
    delete process.env[WEIGHT_KEY];
    const result = makeResult('mem-c', 0.9);

    const [served] = applyGraphBoostWithWeight(
      [result],
      { 'mem-c': 1.0 }, // max normalized contribution
      10,
      effectiveGraphBoostWeight(false)
    );

    expect(served.similarity).toBe(0.9 + 0.10); // max delta = +weight
  });
});
