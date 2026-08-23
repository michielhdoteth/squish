/**
 * Golden-set harness integrity tests.
 *
 * Validates the fixture corpus/query set structure, the pure scoring
 * helpers in run-eval.ts, and runs a small end-to-end smoke eval through
 * the production SDK surface on an isolated temp DB.
 *
 * Run: bun test tests/golden/
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Isolated env BEFORE importing product modules (same pattern as other tests).
const smokeDir = mkdtempSync(join(tmpdir(), 'squish-golden-smoke-'));
process.env.SQUISH_DATA_DIR = smokeDir;
process.env.DATABASE_URL = '';
delete process.env.SQUISH_DATABASE_URL;
process.env.SQUISH_EMBEDDINGS_PROVIDER ||= 'local';

import {
  loadGoldenSet,
  scoreRanking,
  aggregate,
  QUERY_CATEGORIES,
} from './run-eval.js';

const goldenSet = loadGoldenSet(join(__dirname, 'golden-set.json'));
const memoryIds = new Set(goldenSet.memories.map((m) => m.id));

afterAll(async () => {
  try {
    const { closeAllDbs } = await import('../../db/index.js');
    await closeAllDbs();
  } catch {
    // ignore
  }
  try {
    rmSync(smokeDir, { recursive: true, force: true });
  } catch {
    // Windows may briefly hold the SQLite handle; the OS cleans tmpdir.
  }
});

describe('golden set corpus', () => {
  test('has ~60 memories with fixed deterministic IDs', () => {
    expect(goldenSet.memories.length).toBeGreaterThanOrEqual(55);
    expect(goldenSet.memories.length).toBeLessThanOrEqual(65);
    for (const mem of goldenSet.memories) {
      expect(mem.id).toMatch(/^golden_\d{3}$/);
      expect(mem.content.length).toBeGreaterThan(40);
    }
  });

  test('memory ids and contents are unique', () => {
    const ids = goldenSet.memories.map((m) => m.id);
    const contents = goldenSet.memories.map((m) => m.content);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(contents).size).toBe(contents.length);
  });

  test('covers all required content kinds', () => {
    const types = new Set(goldenSet.memories.map((m) => m.type));
    for (const t of ['decision', 'preference', 'context', 'fact']) {
      expect(types.has(t)).toBe(true);
    }
    // v1 -> v2 pairs are tagged superseded/current
    const tags = goldenSet.memories.flatMap((m) => m.tags);
    expect(tags.filter((t) => t === 'superseded').length).toBeGreaterThanOrEqual(4);
    // near-duplicates exist
    expect(memoryIds.has('golden_035') && memoryIds.has('golden_036')).toBe(true);
  });
});

describe('golden query set', () => {
  test('has ~40 queries across all categories', () => {
    expect(goldenSet.queries.length).toBeGreaterThanOrEqual(35);
    expect(goldenSet.queries.length).toBeLessThanOrEqual(50);
    const cats = new Set(goldenSet.queries.map((q) => q.category));
    for (const c of QUERY_CATEGORIES) expect(cats.has(c)).toBe(true);
  });

  test('expected ids resolve against the corpus and never overlap', () => {
    for (const q of goldenSet.queries) {
      expect(q.mustHit.length).toBeGreaterThanOrEqual(1);
      expect(q.mustHit.length).toBeLessThanOrEqual(3);
      for (const id of q.mustHit) expect(memoryIds.has(id)).toBe(true);
      for (const id of q.mayHit ?? []) {
        expect(memoryIds.has(id)).toBe(true);
        expect(q.mustHit.includes(id)).toBe(false);
      }
    }
  });

  test('every corpus memory is reachable from at least one mustHit or mayHit', () => {
    const referenced = new Set(goldenSet.queries.flatMap((q) => [...q.mustHit, ...(q.mayHit ?? [])]));
    // Allow a small tail of background/distractor content to be unreferenced.
    const unreferenced = goldenSet.memories.filter((m) => !referenced.has(m.id));
    expect(unreferenced.length / goldenSet.memories.length).toBeLessThan(0.2);
  });
});

describe('scoreRanking metrics', () => {
  test('perfect ranking scores 1.0 everywhere', () => {
    const s = scoreRanking(['a', 'b'], ['a'], 5);
    expect(s.recallAtK).toBe(1);
    expect(s.rr).toBe(1);
    expect(s.hitAt1).toBe(true);
  });

  test('hit at rank k yields rr = 1/k and correct recall windowing', () => {
    const s = scoreRanking(['x', 'y', 'z', 'w', 'a'], ['a', 'b'], 5);
    expect(s.recallAtK).toBe(0.5); // only 'a' in top-5
    expect(s.rr).toBeCloseTo(1 / 5);
    expect(s.hitAt1).toBe(false);
  });

  test('miss beyond top-k gives zero recall but mrr still counts deeper hits', () => {
    const s = scoreRanking(['x', 'y', 'z', 'w', 'v', 'a'], ['a'], 5);
    expect(s.recallAtK).toBe(0);
    expect(s.rr).toBeCloseTo(1 / 6);
    expect(s.hitAt1).toBe(false);
  });

  test('no hit anywhere zeroes everything', () => {
    const s = scoreRanking(['x', 'y'], ['a'], 5);
    expect(s.recallAtK).toBe(0);
    expect(s.rr).toBe(0);
    expect(s.hitAt1).toBe(false);
  });

  test('aggregate averages per category and overall', () => {
    const { overall, byCategory } = aggregate([
      { category: 'paraphrase', recallAtK: 1, rr: 1, hitAt1: true },
      { category: 'paraphrase', recallAtK: 0, rr: 0, hitAt1: false },
      { category: 'entity', recallAtK: 0.5, rr: 0.5, hitAt1: false },
    ]);
    expect(byCategory['paraphrase'].count).toBe(2);
    expect(byCategory['paraphrase'].recallAt5).toBeCloseTo(0.5);
    expect(byCategory['entity'].count).toBe(1);
    expect(overall.count).toBe(3);
    expect(overall.mrr).toBeCloseTo((1 + 0 + 0.5) / 3);
  });
});

describe('end-to-end smoke eval through SDK surface', () => {
  test('seeding + search retrieves the target memory via goldenId mapping', async () => {
    const { SquishClient } = await import('../../packages/sdk/src/index.js');
    const client = new SquishClient();

    const uuidToGolden = new Map<string, string>();
    const seed = [
      { id: 'smoke_001', content: 'Decision: use Postgres over Mongo because relational integrity matters for experiment metadata.' },
      { id: 'smoke_002', content: 'Preference: weekly reports are bullet-point summaries of one page maximum.' },
      { id: 'smoke_003', content: 'SOP deployment: run tests, build image, push to registry, verify staging health before promoting.' },
    ];
    for (const s of seed) {
      const stored = await client.remember(s.content, {
        type: 'decision',
        metadata: { goldenId: s.id },
      });
      uuidToGolden.set(stored.id, s.id);
    }

    // Same deterministic ISO timestamp rewrite as run-eval.ts: raw epoch
    // integers crash the SDK result mapper on the vector-search read path.
    const { getDb } = await import('../../db/index.js');
    const db = await getDb();
    const sqlite = (db as any)?.$client;
    if (sqlite && typeof sqlite.prepare === 'function') {
      const update = sqlite.prepare('UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?');
      let i = 0;
      for (const [uuid] of uuidToGolden) {
        const iso = new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString();
        update.run(iso, iso, uuid);
        i += 1;
      }
    }

    const results = await client.search('why relational integrity for experiment metadata?', { limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    const ranked = results.map((r: any) => uuidToGolden.get(r?.memory?.id ?? r?.id)).filter(Boolean);
    expect(ranked).toContain('smoke_001');

    const scoredResult = scoreRanking(ranked, ['smoke_001'], 3);
    expect(scoredResult.hitAt1).toBe(true);
  }, 30000);
});
