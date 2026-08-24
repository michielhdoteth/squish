/**
 * Batch 6b backfill: sector re-classification + legacy hot-tier repair.
 * Idempotency and dry-run behavior.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'squish-backfill6b-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';
delete process.env.SQUISH_SECTOR_BACKFILL_DRY_RUN;

const { resetDb, getDb } = await import('../../db/index.js');
const { runBatch6bBackfill } = await import('../../db/migrations/batch6b-backfill.js');

async function seed(sqlite: any) {
  const insert = sqlite.prepare(
    `INSERT INTO memories (id, type, content, tags, metadata, source, sector, tier, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', strftime('%s','now'))`
  );

  // Legacy default: episodic sector + hot tier (the pre-6b schema defaults).
  await insert.run(
    'bf-fact-1', 'fact', 'The main database is PostgreSQL',
    JSON.stringify([]), null, null,
    'episodic', 'hot'
  );
  // Decision stored before routing existed.
  await insert.run(
    'bf-decision-1', 'decision', 'We chose bun over node for the dashboard',
    JSON.stringify([]), JSON.stringify({ source: 'mcp' }), 'mcp',
    'episodic', 'hot'
  );
  // Observation with how-to content should route procedural.
  await insert.run(
    'bf-howto-1', 'observation', 'How to rotate the API keys on the VPS without downtime',
    JSON.stringify([]), null, null,
    'episodic', 'working'
  );
  // Already-correct row: must NOT be rewritten (idempotency witness).
  await insert.run(
    'bf-ok-1', 'fact', 'Already semantic', JSON.stringify([]), null, null,
    'semantic', 'working'
  );
}

describe('runBatch6bBackfill (Batch 6b)', () => {
  let sqlite: any;

  /** Simulate a pre-backfill database by removing the one-time marker. */
  function clearMarker() {
    sqlite.prepare("DELETE FROM _schema_versions WHERE version = '2.2.0-batch6b-sector-backfill'").run();
  }

  beforeAll(async () => {
    resetDb();
    const db = await getDb();
    sqlite = (db as any).$client;
    await seed(sqlite);
    // Boot already ran the (empty-table) backfill pass and recorded its
    // marker; drop it so these tests exercise the actual migration body.
    clearMarker();
  });

  afterAll(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    delete process.env.SQUISH_DATA_DIR;
  });

  test('dry-run reports would-be changes without mutating rows', async () => {
    const result = await runBatch6bBackfill(sqlite, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.sectorsUpdated).toBeGreaterThan(0);

    const row = sqlite.prepare('SELECT sector FROM memories WHERE id = ?').get('bf-fact-1');
    expect(row.sector).toBe('episodic'); // untouched
  });

  test('reclassifies sectors by type+tags and repairs legacy hot tiers', async () => {
    const result = await runBatch6bBackfill(sqlite, {});
    expect(result.dryRun).toBe(false);

    const fact = sqlite.prepare('SELECT sector, tier FROM memories WHERE id = ?').get('bf-fact-1');
    expect(fact.sector).toBe('semantic');
    // Legacy hot -> working (decay exemption removed).
    expect(fact.tier).toBe('working');

    const decision = sqlite.prepare('SELECT sector FROM memories WHERE id = ?').get('bf-decision-1');
    expect(decision.sector).toBe('semantic');

    const howto = sqlite.prepare('SELECT sector FROM memories WHERE id = ?').get('bf-howto-1');
    expect(howto.sector).toBe('procedural');

    const ok = sqlite.prepare('SELECT sector FROM memories WHERE id = ?').get('bf-ok-1');
    expect(ok.sector).toBe('semantic'); // unchanged semantics
  });

  test('second run is a no-op (idempotent)', async () => {
    // First run recorded the marker; a plain re-run short-circuits at O(1).
    const result = await runBatch6bBackfill(sqlite, {});
    expect(result.sectorsUpdated).toBe(0);
    expect(result.tiersFixed).toBe(0);

    // Even with the marker cleared, content-level idempotence holds: nothing
    // left to change.
    clearMarker();
    const result2 = await runBatch6bBackfill(sqlite, {});
    expect(result2.sectorsUpdated).toBe(0);
    expect(result2.tiersFixed).toBe(0);
  });
});
