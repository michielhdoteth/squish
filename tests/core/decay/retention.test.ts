/**
 * Batch 6b: retention module - Ebbinghaus decay-to-ranking connection.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeRetention, type RetentionRow } from '../../../core/decay/retention.js';
import { betaForMemoryType } from '../../../core/decay/ebbinghaus.js';
import { applyTieredDecay } from '../../../core/decay/decay-engine.js';

// Isolated temp DB before any product import touches storage.
const tempDir = mkdtempSync(join(tmpdir(), 'squish-retention-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';

import { resetDb } from '../../../db/index.js';

const NOW = Date.UTC(2026, 7, 23); // fixed now: 2026-08-23
const DAY = 86_400_000;

beforeAll(() => {
  resetDb();
});

afterAll(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  delete process.env.SQUISH_DATA_DIR;
});

function row(overrides: Partial<RetentionRow>): RetentionRow {
  return {
    id: 'r1',
    type: 'fact',
    tier: 'working',
    createdAt: Math.floor((NOW - 10 * DAY) / 1000),
    lastDecayAt: null,
    decayRate: 30,
    ...overrides,
  };
}

describe('betaForMemoryType (Batch 6b vocabulary mapping)', () => {
  test('real write-path vocab maps onto tier classes', () => {
    expect(betaForMemoryType('observation')).toBe(0.10); // fleeting-equivalent
    expect(betaForMemoryType('note')).toBe(0.10);
    expect(betaForMemoryType('task')).toBe(0.05);        // working-equivalent
    expect(betaForMemoryType('context')).toBe(0.05);
    expect(betaForMemoryType('fact')).toBe(0.02);        // long-term-equivalent
    expect(betaForMemoryType('decision')).toBe(0.01);    // sturdy-equivalent
    expect(betaForMemoryType('preference')).toBe(0.01);
  });

  test('unknown types default to working-equivalent, NOT the old 0.3', () => {
    expect(betaForMemoryType('mystery')).toBe(0.05);
    expect(betaForMemoryType(undefined)).toBe(0.05);
    expect(betaForMemoryType(null)).toBe(0.05);
  });

  test('sector vocabulary keeps its original betas', () => {
    expect(betaForMemoryType('episodic')).toBe(0.07);
    expect(betaForMemoryType('semantic')).toBe(0.02);
    expect(betaForMemoryType('procedural')).toBe(0.03);
  });
});

describe('computeRetention (pure)', () => {
  test('fresh memory retains ~1', () => {
    const r = computeRetention(row({ createdAt: Math.floor((NOW - 1 * 3600_000) / 1000) }), NOW);
    expect(r).toBeGreaterThan(0.99);
  });

  test('older memory decays but stays bounded in [0,1]', () => {
    const r = computeRetention(row({ createdAt: Math.floor((NOW - 200 * DAY) / 1000) }), NOW);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    // fact beta=0.02, tau=30, t=200d: (1+6.67)^-0.02 ~= 0.958 -> slow decay
    expect(r).toBeGreaterThan(0.9);
  });

  test('fleeting tier decays faster than working for same row', () => {
    const base = row({ createdAt: Math.floor((NOW - 100 * DAY) / 1000), type: 'observation' });
    const fleeting = computeRetention({ ...base, tier: 'fleeting' }, NOW);
    const working = computeRetention(base, NOW);
    expect(fleeting).toBeLessThan(working);
  });

  test('sturdy/hot tiers never decay (retention = 1)', () => {
    const old = Math.floor((NOW - 400 * DAY) / 1000);
    expect(computeRetention(row({ tier: 'sturdy', createdAt: old }), NOW)).toBe(1);
    expect(computeRetention(row({ tier: 'hot', createdAt: old }), NOW)).toBe(1);
  });

  test('rows without temporal anchor are treated as fully retained (with a logged warning, never silent)', () => {
    expect(computeRetention(row({ createdAt: null, lastDecayAt: null }), NOW)).toBe(1);
  });

  test('unparseable last_decay_at falls back to created_at instead of silently returning 1', () => {
    const old = Math.floor((NOW - 200 * DAY) / 1000);
    const r = computeRetention(
      row({ createdAt: old, lastDecayAt: 'not-a-timestamp' as unknown as number }),
      NOW
    );
    // fact beta=0.02, tau=30, t=200d -> ~0.958; a silent-1.0 bug would return exactly 1.
    expect(r).toBeLessThan(0.999);
    expect(r).toBeGreaterThan(0.9);
  });

  test('mixed timestamp formats parse: ISO text + epoch seconds + epoch ms agree', () => {
    const sec = Math.floor((NOW - 50 * DAY) / 1000);
    const iso = new Date(sec * 1000).toISOString();
    const ms = sec * 1000;
    const viaSec = computeRetention(row({ createdAt: sec }), NOW);
    expect(computeRetention(row({ createdAt: iso }), NOW)).toBeCloseTo(viaSec, 10);
    expect(computeRetention(row({ createdAt: ms }), NOW)).toBeCloseTo(viaSec, 10);
    // Mixed columns (ISO lastDecayAt + epoch createdAt) still anchor correctly.
    const mixed = computeRetention(row({ createdAt: iso, lastDecayAt: iso }), NOW);
    expect(mixed).toBeCloseTo(viaSec, 10);
  });

  test('NULL decay_rate falls back to the ENGINE value tau=1d (not the old 30d)', () => {
    // observation beta=0.10, working tier, age 5d:
    //   tau=1  -> R = 6^-0.10 ~= 0.836
    //   tau=30 -> R = (1+5/30)^-0.10 ~= 0.985 (the old wrong fallback)
    const r = computeRetention(
      row({ type: 'observation', tier: 'working', createdAt: Math.floor((NOW - 5 * DAY) / 1000), decayRate: null }),
      NOW
    );
    expect(r).toBeGreaterThan(0.75);
    expect(r).toBeLessThan(0.9);
  });

  test('long-term mirrors engine time-shrink semantics (R_lt(t) == R_working(t/2))', () => {
    const ageDays = 120;
    const base = row({ createdAt: Math.floor((NOW - ageDays * DAY) / 1000), type: 'fact' });
    const longTerm = computeRetention({ ...base, tier: 'long-term' }, NOW);
    const halfAgeWorking = computeRetention(
      row({ createdAt: Math.floor((NOW - (ageDays / 2) * DAY) / 1000), type: 'fact' }),
      NOW
    );
    expect(longTerm).toBeCloseTo(halfAgeWorking, 12);
  });

  test('fleeting mirrors engine score-halving (R_fleeting == R_working / 2)', () => {
    const base = row({ createdAt: Math.floor((NOW - 90 * DAY) / 1000), type: 'note' });
    const fleeting = computeRetention({ ...base, tier: 'fleeting' }, NOW);
    const working = computeRetention(base, NOW);
    expect(fleeting).toBeCloseTo(working / 2, 12);
  });
});

describe('retention <-> decay-engine mirror property', () => {
  // Deterministic seeded PRNG so failures are reproducible.
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  test('computeRetention(ts) x score == applyTieredDecay(score) for randomized rows', () => {
    const rnd = lcg(20260824);
    const types: Array<string | null> = ['observation', 'note', 'task', 'context', 'session', 'fact', 'decision', 'preference', 'episodic', 'semantic', 'procedural', 'self-model', 'introspective', 'unknown-kind', null];
    const tiers: Array<string | null> = [null, 'working', 'long-term', 'fleeting', 'sturdy', 'hot', 'cold'];

    for (let i = 0; i < 500; i++) {
      const type = types[Math.floor(rnd() * types.length)] ?? null;
      const tier = tiers[Math.floor(rnd() * tiers.length)] ?? null;
      const createdSec = Math.max(1, Math.floor((NOW - rnd() * 400 * DAY) / 1000));
      const hasLastDecay = rnd() < 0.7;
      const lastDecaySec = hasLastDecay ? Math.floor((NOW - rnd() * 200 * DAY) / 1000) : null;
      const decayRate = rnd() < 0.8 ? Math.ceil(rnd() * 90) + 1 : null;
      // 1..100: score 0 hits the engine's `|| 100` legacy fallback, which is an
      // engine-input quirk outside the retention-ratio contract.
      const score = Math.ceil(rnd() * 100);

      const retentionRow: RetentionRow = { id: `prop-${i}`, type, tier, createdAt: createdSec, lastDecayAt: lastDecaySec, decayRate };
      const ratio = computeRetention(retentionRow, NOW);
      const engineScore = applyTieredDecay(
        { score, memoryType: type, tier, lastDecayAtSec: lastDecaySec, createdAtSec: createdSec, decayRateDays: decayRate },
        NOW
      );

      const mirroredScore = ratio * score;
      if (Math.abs(mirroredScore - engineScore) >= 1e-9) {
        throw new Error(
          `mirror divergence at case ${i}: retention*score=${mirroredScore} vs engine=${engineScore} ` +
          `(type=${type}, tier=${tier}, created=${createdSec}, lastDecay=${lastDecaySec}, decayRate=${decayRate})`
        );
      }
    }
  });
});
