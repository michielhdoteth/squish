/**
 * Batch 6b: retention module - Ebbinghaus decay-to-ranking connection.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeRetention, getRetentionMap, type RetentionRow } from '../../../core/decay/retention.js';
import { betaForMemoryType } from '../../../core/decay/ebbinghaus.js';

// Isolated temp DB before any product import touches storage.
const tempDir = mkdtempSync(join(tmpdir(), 'squish-retention-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';

import { resetDb, getDb } from '../../../db/index.js';

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

  test('rows without temporal anchor are treated as fully retained', () => {
    expect(computeRetention(row({ createdAt: null, lastDecayAt: null }), NOW)).toBe(1);
  });
});

describe('getRetentionMap (DB-backed)', () => {
  test('computes per-memory retention from decay columns; missing ids absent', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
    const sqlite = (db as any).$client;
    const idA = '11111111-1111-1111-1111-111111111111';
    const idB = '22222222-2222-2222-2222-222222222222';
    const oldSec = Math.floor((NOW - 100 * DAY) / 1000);
    const freshSec = Math.floor((NOW - 1 * DAY) / 1000);

    // Schema defaults last_decay_at to now; pin it so age is deterministic.
    sqlite.prepare(
      `INSERT INTO memories (id, type, tier, content, created_at, last_decay_at, decay_rate, status)
       VALUES (?, 'observation', 'fleeting', 'seed', ?, ?, 30, 'active')`
    ).run(idA, oldSec, oldSec);
    sqlite.prepare(
      `INSERT INTO memories (id, type, tier, content, created_at, last_decay_at, decay_rate, status)
       VALUES (?, 'decision', 'sturdy', 'seed', ?, ?, 30, 'active')`
    ).run(idB, oldSec, oldSec);

    const map = await getRetentionMap([idA, idB, '99999999-9999-9999-9999-999999999999']);

    // Fleeting observation aged 100d decays measurably
    // (beta=0.10x2, tau=30 -> R ~ 0.75), well below full retention.
    expect(map.has(idA)).toBe(true);
    expect(map.get(idA)!).toBeLessThan(0.85);
    // Sturdy decision never decays.
    expect(map.get(idB)).toBe(1);
    // Unknown ids are simply absent (honest absence, not fabricated zeros).
    expect(map.has('99999999-9999-9999-9999-999999999999')).toBe(false);

    // Fresh row anchors near 1 regardless of tier.
    const idC = '33333333-3333-3333-3333-333333333333';
    sqlite.prepare(
      `INSERT INTO memories (id, type, tier, content, created_at, last_decay_at, decay_rate, status)
       VALUES (?, 'fact', 'working', 'seed', ?, ?, 30, 'active')`
    ).run(idC, freshSec, freshSec);
    const map2 = await getRetentionMap([idC]);
    expect(map2.get(idC)!).toBeGreaterThan(0.99);
  });
});
