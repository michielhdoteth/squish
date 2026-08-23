/**
 * Tests for core/scheduler/job-runner.ts archiveStaleMemories.
 *
 * Uses a real isolated SQLite database (temp SQUISH_DATA_DIR) instead of
 * mock.module on db/index.js -- module mocks are process-global in bun test
 * and leak into every test file that runs afterwards.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

const testDataDir = join(
  tmpdir(),
  `squish-job-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
mkdirSync(testDataDir, { recursive: true });
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

let resetDb: typeof import('../../../db/index.js').resetDb;
let getDb: typeof import('../../../db/index.js').getDb;
let archiveStaleMemories: typeof import('../../../core/scheduler/job-runner.js').archiveStaleMemories;

function getSqlite(): any {
  // Resolved lazily after getDb() so the client exists
  return (dbRef as any).$client;
}

let dbRef: any;

async function insertMemory(id: string, opts: {
  lastAccessedDaysAgo?: number;
  importance?: number;
  isProtected?: boolean;
  isPinned?: boolean;
} = {}) {
  const days = opts.lastAccessedDaysAgo ?? 200;
  const lastAccessedSeconds = Math.floor(Date.now() / 1000) - days * 86400;
  getSqlite().prepare(`
    INSERT INTO memories (id, type, content, status, context_status, is_active, is_protected, is_pinned, importance_score, last_accessed_at, updated_at)
    VALUES (?, 'observation', 'test', 'active', 'out-of-context', 1, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.isProtected ? 1 : 0,
    opts.isPinned ? 1 : 0,
    opts.importance ?? 10,
    lastAccessedSeconds,
    Math.floor(Date.now() / 1000),
  );
}

describe('archiveStaleMemories', () => {
  beforeAll(async () => {
    const dbMod = await import('../../../db/index.js');
    const jobRunnerMod = await import('../../../core/scheduler/job-runner.js');
    resetDb = dbMod.resetDb;
    getDb = dbMod.getDb;
    archiveStaleMemories = jobRunnerMod.archiveStaleMemories;
    resetDb();
    dbRef = await getDb();
    // Clear schema-bootstrap seed rows so assertions on inserted rows are exact
    getSqlite().exec('DELETE FROM memories;');
    insertMemory('old-low');
    insertMemory('old-high-importance', { importance: 80 });
    insertMemory('recent-low', { lastAccessedDaysAgo: 5 });
    insertMemory('old-protected', { isProtected: true });
    insertMemory('old-pinned', { isPinned: true });
  });

  afterAll(() => {
    try {
      const client = dbRef?.$client;
      if (client && typeof client.close === 'function') client.close();
    } catch {
      // ignore
    }
    try {
      resetDb();
    } catch {
      // ignore
    }
    try {
      rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Windows may hold the file briefly; temp dir is harmless
    }
  });

  test('archives stale, low-importance, unprotected memories only', async () => {
    const count = await archiveStaleMemories(90);
    expect(count).toBe(1);

    const rows = getSqlite().prepare('SELECT id, status, context_status, is_active FROM memories').all() as any[];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId['old-low'].status).toBe('archived');
    expect(byId['old-low'].context_status).toBe('archived');
    expect(byId['old-low'].is_active).toBe(0);

    expect(byId['old-high-importance'].status).toBe('active');
    expect(byId['recent-low'].status).toBe('active');
    expect(byId['old-protected'].status).toBe('active');
    expect(byId['old-pinned'].status).toBe('active');
  });

  test('returns 0 for already-archived set (idempotent)', async () => {
    const count = await archiveStaleMemories(90);
    expect(count).toBe(0);
  });
});
