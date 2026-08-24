/**
 * Batch 6b regression: supersedeOldTemporalFacts must update ALL superseded
 * ids (previously only toSupersede[0]) and persist the computed newValidFrom
 * onto the superseding memory.
 *
 * The production temporal parser only emits point-in-time facts
 * (start == end), which makes factsOverlap() + isMoreRecent() mutually
 * exclusive in practice. To exercise the supersession loop deterministically,
 * this file mocks the parser module (before temporal-facts is imported) with
 * properly RANGED facts.
 */
import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'squish-supersession-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';

const MS_DAY = 86_400_000;
function rangedFact(startIso: string, endIso: string) {
  return [{
    type: 'absolute',
    value: `${startIso}..${endIso}`,
    parsed: { start: new Date(startIso), end: new Date(endIso) },
    confidence: 0.95,
    context: 'test',
  }];
}

// Markers embedded in test contents decide which ranged facts the parser yields.
mock.module('../../core/memory/temporal-parser.js', () => ({
  parseTemporalFacts: async (content: string) => {
    if (content.includes('NEWFACT-TOKEN')) return rangedFact('2026-06-03T00:00:00Z', '2026-06-08T00:00:00Z');
    if (content.includes('OLDCAND-TOKEN')) return rangedFact('2026-06-01T00:00:00Z', '2026-06-05T00:00:00Z');
    if (content.includes('EARLIERSTART-TOKEN')) return rangedFact('2026-05-20T00:00:00Z', '2026-05-21T00:00:00Z');
    return [];
  },
}));

const { resetDb, getDb } = await import('../../db/index.js');
const { supersedeOldTemporalFacts } = await import('../../core/memory/temporal-facts.js');

describe('supersedeOldTemporalFacts (Batch 6b fixes)', () => {
  beforeAll(() => {
    resetDb();
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    delete process.env.SQUISH_DATA_DIR;
  });

  test('updates ALL overlapping candidates, not only the first', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const candA = 'aaaaaaaa-0000-0000-0000-000000000001';
    const candB = 'bbbbbbbb-0000-0000-0000-000000000002';
    const bystander = 'cccccccc-0000-0000-0000-000000000003';
    const newId = 'dddddddd-0000-0000-0000-000000000004';

    const insert = sqlite.prepare(
      `INSERT INTO memories (id, type, content, status, created_at)
       VALUES (?, 'fact', ?, 'active', strftime('%s','now'))`
    );
    insert.run(candA, 'OLDCAND-TOKEN policy for Acme');
    insert.run(candB, 'OLDCAND-TOKEN policy for Acme v2');
    insert.run(bystander, 'unrelated note without tokens');
    // The superseding memory itself (already inserted, as the write path does)
    insert.run(newId, 'NEWFACT-TOKEN updated policy for Acme');

    const result = await supersedeOldTemporalFacts(newId, 'NEWFACT-TOKEN updated policy for Acme');

    // New fact range (06-03..06-08) overlaps candidate range (06-01..06-05)
    // and starts later -> BOTH candidates must be superseded.
    expect(result.supersededCount).toBe(2);

    const rowA = sqlite.prepare('SELECT status, superseded_by FROM memories WHERE id = ?').get(candA);
    const rowB = sqlite.prepare('SELECT status, superseded_by FROM memories WHERE id = ?').get(candB);
    const rowBy = sqlite.prepare('SELECT status FROM memories WHERE id = ?').get(bystander);
    expect(rowA.status).toBe('superseded');
    expect(rowB.status).toBe('superseded');
    expect(rowA.superseded_by).toBe(newId);
    expect(rowB.superseded_by).toBe(newId);
    expect(rowBy.status).toBe('active');
  });

  test('persists computed newValidFrom onto the superseding memory', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const candOld = 'eeeeeeee-0000-0000-0000-000000000001';
    const newId = 'ffffffff-0000-0000-0000-000000000002';

    const insert = sqlite.prepare(
      `INSERT INTO memories (id, type, content, status, created_at)
       VALUES (?, 'fact', ?, 'active', strftime('%s','now'))`
    );
    insert.run(candOld, 'OLDCAND-TOKEN deployment runbook');
    insert.run(newId, 'EARLIERSTART-TOKEN deployment runbook refreshed');

    // Candidate range 06-01..06-05 vs EARLIERSTART 05-20..05-21:
    // no overlap -> nothing superseded, validFrom untouched.
    await supersedeOldTemporalFacts(newId, 'EARLIERSTART-TOKEN deployment runbook refreshed');
    let row = sqlite.prepare('SELECT valid_from FROM memories WHERE id = ?').get(newId);
    expect(row.valid_from).toBeNull();

    // Now genuinely overlapping candidates: BOTH OLDCAND rows overlap
    // the new range -> batch update covers all of them, and the computed
    // newValidFrom (= min start of the NEW memory's own facts = 2026-06-03)
    // is persisted onto the superseding row.
    const candOverlap1 = 'abababab-0000-0000-0000-000000000003';
    const candOverlap2 = 'cdcdcdcd-0000-0000-0000-000000000004';
    insert.run(candOverlap1, 'OLDCAND-TOKEN second overlapping fact');
    insert.run(candOverlap2, 'OLDCAND-TOKEN third overlapping fact');
    const result = await supersedeOldTemporalFacts(newId, 'NEWFACT-TOKEN deployment runbook final');

    expect(result.supersededCount).toBe(3); // candOld + both overlaps
    expect(result.newValidFrom.toISOString().startsWith('2026-06-03')).toBe(true);

    row = sqlite.prepare('SELECT valid_from FROM memories WHERE id = ?').get(newId);
    expect(row.valid_from).not.toBeNull();
    // Stored as epoch seconds; compare within an hour of the expected UTC instant.
    const expectedMs = Date.UTC(2026, 5, 3);
    const storedMs = Number(row.valid_from) * 1000;
    expect(Math.abs(storedMs - expectedMs)).toBeLessThan(MS_DAY / 24);
  });
});
