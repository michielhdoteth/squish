import { describe, test, expect, beforeAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    context_status TEXT DEFAULT 'out-of-context',
    is_active INTEGER DEFAULT 1,
    is_protected INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    importance_score INTEGER DEFAULT 50,
    last_accessed_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`);

export const db = drizzle(sqlite);

mock.module('../../../db/index.js', () => ({
  getDb: async () => db,
}));

const { archiveStaleMemories } = await import('../../../core/scheduler/job-runner.js');

function insertMemory(id: string, opts: {
  lastAccessedDaysAgo?: number;
  importance?: number;
  isProtected?: boolean;
  isPinned?: boolean;
} = {}) {
  const days = opts.lastAccessedDaysAgo ?? 200;
  sqlite.prepare(`
    INSERT INTO memories (id, content, status, context_status, is_active, is_protected, is_pinned, importance_score, last_accessed_at, updated_at)
    VALUES (?, 'test', 'active', 'out-of-context', 1, ?, ?, ?, ?, 0)
  `).run(
    id,
    opts.isProtected ? 1 : 0,
    opts.isPinned ? 1 : 0,
    opts.importance ?? 10,
    Math.floor(Date.now() / 1000) - days * 86400,
  );
}

describe('archiveStaleMemories', () => {
  beforeAll(() => {
    insertMemory('old-low');
    insertMemory('old-high-importance', { importance: 80 });
    insertMemory('recent-low', { lastAccessedDaysAgo: 5 });
    insertMemory('old-protected', { isProtected: true });
    insertMemory('old-pinned', { isPinned: true });
  });

  test('archives stale, low-importance, unprotected memories only', async () => {
    const count = await archiveStaleMemories(90);
    expect(count).toBe(1);

    const rows = sqlite.prepare('SELECT id, status, context_status, is_active FROM memories').all() as any[];
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
