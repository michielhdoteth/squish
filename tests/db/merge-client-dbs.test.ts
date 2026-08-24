import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  MERGE_MANIFEST_FILENAME,
  maybeMergeLegacyClientDbs,
  openNativeSqlite,
  type MergeManifest,
} from '../../db/merge-client-dbs.js';
import { ensureSqliteSchema } from '../../db/bootstrap.js';

interface TempRoot {
  root: string;
  targetDb: string;
  seedClientDb(client: string, memories: Array<{ id: string; content: string; type?: string }>): Promise<string>;
  countMemories(dbPath: string): Promise<number>;
  cleanup(): void;
}

async function makeTempRoot(): Promise<TempRoot> {
  const root = mkdtempSync(join(tmpdir(), 'squish-merge-test-'));
  return {
    root,
    targetDb: join(root, 'squish.db'),
    async seedClientDb(client, memories) {
      const dbPath = join(root, client, 'squish.db');
      const handle = await openNativeSqlite(dbPath, { readonly: false });
      try {
        await ensureSqliteSchema(handle as never);
        for (const memory of memories) {
          handle
            .prepare('INSERT INTO memories (id, type, content) VALUES (?, ?, ?)')
            .run(memory.id, memory.type ?? 'note', memory.content);
        }
      } finally {
        handle.close();
      }
      return dbPath;
    },
    async countMemories(dbPath) {
      if (!existsSync(dbPath)) return 0;
      const handle = await openNativeSqlite(dbPath, { readonly: true });
      try {
        const row = handle.prepare('SELECT COUNT(*) as n FROM memories').get() as { n: number | bigint };
        return Number(row.n);
      } finally {
        handle.close();
      }
    },
    cleanup() {
      // Windows can briefly hold file locks right after sqlite close.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          rmSync(root, { recursive: true, force: true });
          return;
        } catch {
          void sleep(50);
        }
      }
    },
  };
}

describe('maybeMergeLegacyClientDbs', () => {
  test('no-op when no legacy client DBs exist and no marker is written', async () => {
    const t = await makeTempRoot();
    try {
      const result = await maybeMergeLegacyClientDbs(t.targetDb, { force: true });
      expect(result).toBeNull();
      expect(existsSync(join(t.root, MERGE_MANIFEST_FILENAME))).toBe(false);
    } finally {
      t.cleanup();
    }
  }, 20_000);

  test('merges rows from two legacy client DBs, writes manifest, leaves sources intact', async () => {
    const t = await makeTempRoot();
    try {
      const claudeRows = [
        { id: 'claude-1', content: 'Claude memory one' },
        { id: 'claude-2', content: 'Claude memory two' },
      ];
      const opencodeRows = [
        { id: 'opencode-1', content: 'OpenCode memory one' },
        { id: 'opencode-2', content: 'OpenCode memory two' },
        { id: 'opencode-3', content: 'OpenCode memory three' },
      ];
      const claudeDb = await t.seedClientDb('claude', claudeRows);
      const opencodeDb = await t.seedClientDb('opencode', opencodeRows);

      // Target does not exist yet -> migration must create + bootstrap it.
      expect(existsSync(t.targetDb)).toBe(false);

      const manifest = await maybeMergeLegacyClientDbs(t.targetDb, { force: true });
      expect(manifest).not.toBeNull();

      const m = manifest as MergeManifest;
      expect(m.sources).toHaveLength(2);

      // Merged counts
      expect(await t.countMemories(t.targetDb)).toBe(5);

      // Per-source reports account for every seeded memory row.
      for (const [source, expectedMemories] of [
        [m.sources[0], claudeRows.length],
        [m.sources[1], opencodeRows.length],
      ] as const) {
        expect(source.tables.memories?.sourceRows).toBe(expectedMemories);
        expect(source.tables.memories?.inserted).toBe(expectedMemories);
      }

      // Manifest file exists on disk with the same content.
      const manifestPath = join(t.root, MERGE_MANIFEST_FILENAME);
      expect(existsSync(manifestPath)).toBe(true);
      const persisted = JSON.parse(readFileSync(manifestPath, 'utf-8')) as MergeManifest;
      expect(persisted.totalInserted).toBe(m.totalInserted);
      expect(persisted.targetDb).toBe(m.targetDb);

      // Sources untouched: same row counts after the merge.
      expect(await t.countMemories(claudeDb)).toBe(2);
      expect(await t.countMemories(opencodeDb)).toBe(3);

      // Marker guard: a second run is a no-op.
      const secondRun = await maybeMergeLegacyClientDbs(t.targetDb);
      expect(secondRun).toBeNull();
      expect(await t.countMemories(t.targetDb)).toBe(5);
    } finally {
      t.cleanup();
    }
  }, 20_000);

  test('dedupes identical ids across sources and skips duplicate content', async () => {
    const t = await makeTempRoot();
    try {
      const sharedId = 'shared-id-1';
      await t.seedClientDb('claude', [
        { id: sharedId, content: 'Shared content' },
        { id: 'unique-claude', content: 'Only in claude' },
      ]);
      // Same id AND same content as above; plus a new unique row.
      await t.seedClientDb('opencode', [
        { id: sharedId, content: 'Shared content' },
        { id: 'unique-opencode', content: 'Only in opencode' },
      ]);

      const manifest = await maybeMergeLegacyClientDbs(t.targetDb, { force: true });
      expect(manifest).not.toBeNull();

      // 3 distinct memories total (shared id collapses to one).
      expect(await t.countMemories(t.targetDb)).toBe(3);
      expect((manifest as MergeManifest).totalSkippedDuplicates).toBeGreaterThanOrEqual(1);
    } finally {
      t.cleanup();
    }
  }, 20_000);

  test('merges into an existing shared DB without duplicating its rows', async () => {
    const t = await makeTempRoot();
    try {
      // Pre-existing shared target with schema and one memory.
      const targetHandle = await openNativeSqlite(t.targetDb, { readonly: false });
      await ensureSqliteSchema(targetHandle as never);
      targetHandle.prepare('INSERT INTO memories (id, type, content) VALUES (?, ?, ?)').run(
        'existing-1',
        'note',
        'Already here'
      );
      targetHandle.close();

      await t.seedClientDb('claude', [
        { id: 'existing-1', content: 'Already here' }, // duplicate of target row
        { id: 'client-new', content: 'From client dir' },
      ]);

      const manifest = await maybeMergeLegacyClientDbs(t.targetDb, { force: true });
      expect(manifest).not.toBeNull();
      expect(await t.countMemories(t.targetDb)).toBe(2); // existing + one new
    } finally {
      t.cleanup();
    }
  }, 20_000);

  test('reports same-id/different-content collisions as explicit conflicts, not duplicates', async () => {
    const t = await makeTempRoot();
    try {
      await t.seedClientDb('claude', [
        { id: 'conflict-1', content: 'Version A from claude' },
        { id: 'unique-a', content: 'Unique to claude' },
      ]);
      await t.seedClientDb('opencode', [
        // Same id as above but DIFFERENT content -> conflict, not a dupe.
        { id: 'conflict-1', content: 'Version B from opencode' },
        { id: 'unique-b', content: 'Unique to opencode' },
      ]);

      const manifest = await maybeMergeLegacyClientDbs(t.targetDb, { force: true });
      expect(manifest).not.toBeNull();

      const m = manifest as MergeManifest;
      expect(m.totalConflicts).toBe(1);

      // The collision is reported on the SECOND source (opencode re-sends an
      // id that claude already contributed with different content).
      const conflictingReports = m.sources
        .map((source) => source.tables.memories)
        .filter((report) => (report?.conflicts ?? 0) > 0);
      expect(conflictingReports).toHaveLength(1);
      const memoriesReport = conflictingReports[0];
      expect(memoriesReport?.conflictIds).toContain('conflict-1');

      // Conflicts are not silently lumped into duplicates.
      expect(memoriesReport?.skippedDuplicates).toBe(0);

      // Target keeps the first-seen version; conflicting row is not inserted.
      expect(await t.countMemories(t.targetDb)).toBe(3);
    } finally {
      t.cleanup();
    }
  }, 20_000);
});



