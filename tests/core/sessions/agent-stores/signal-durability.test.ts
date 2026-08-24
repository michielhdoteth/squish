/**
 * Batch 7 review fixes:
 *   - I-1  Signal durability: `squish sessions show` (short-lived CLI)
 *     must persist working-set signals before exit. Asserts rows exist
 *     IMMEDIATELY after the awaited read - no settle sleep. The old
 *     fire-and-forget call lost this race on every CLI invocation.
 *   - M-1  Bogus "projects" project synthesis: transcripts without a
 *     history entry must resolve a REAL project directory (or none),
 *     never attribute to a hash dir basename.
 *   - M-6  RawMessage timestamp typing: ISO-string timestamps in
 *     transcripts must normalize instead of poisoning chunk timestamps.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-sigdur-'));
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

import { getDbClient } from '../../../../core/lib/db-client.js';
import {
  getClaudeCodeSession,
  searchClaudeCodeSessions,
  deriveProjectForTranscript,
} from '../../../../core/sessions/agent-stores/claude-code.js';

// Deterministic fixture root WITHOUT hyphens so lossy hash reversal can
// reconstruct it exactly ('-' is the hash separator).
const fixtureRoot = path.join(os.tmpdir(), 'sqtestprojA');
const realProjectDir = path.join(fixtureRoot, 'sub');

const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-claude-sig-'));
const projectsDir = path.join(claudeDir, 'projects');

function projectHash(p: string): string {
  return p.replace(/:/g, '-').replace(/\\/g, '-');
}

function writeTranscript(hashDirName: string, sessionId: string, lines: unknown[]): void {
  const dir = path.join(projectsDir, hashDirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  );
}

afterAll(async () => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    fs.rmSync(claudeDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

async function contextSessionRow(sessionId: string): Promise<Record<string, unknown> | null> {
  const { db, schema } = await getDbClient();
  const { eq } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.sessionId, sessionId))
    .limit(1);
  return (rows[0] as Record<string, unknown>) ?? null;
}

describe('I-1: CLI show path persists session signals', () => {
  const sessionId = 'sig-dur-001';
  const opts = { claudeDir };

  test('signals exist immediately after getClaudeCodeSession returns', async () => {
    // Real project directory + matching transcript, WITH a history entry.
    fs.mkdirSync(realProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'history.jsonl'),
      JSON.stringify({
        display: 'Signal durability fixture',
        timestamp: Date.now(),
        project: realProjectDir,
        sessionId,
      }) + '\n'
    );
    writeTranscript(projectHash(realProjectDir), sessionId, [
      { type: 'user', message: { role: 'user', content: 'fix core/src/wake/marker.ts for sigdur' }, uuid: 'u1', timestamp: 1735689600000 },
      { type: 'assistant', message: { role: 'assistant', content: 'on it' }, uuid: 'a1', timestamp: 1735689601000 },
    ]);

    const detail = await getClaudeCodeSession(sessionId, opts);
    expect(detail).not.toBeNull();

    // Durability contract: NO settle/sleep. A fire-and-forget signal write
    // would race process exit and this row would be missing.
    const row = await contextSessionRow(`claude-code:${sessionId}`);
    expect(row).not.toBeNull();
  });

  test('recorded signals carry the real project attribution', async () => {
    const row = await contextSessionRow('claude-code:sig-dur-001');
    expect(row).not.toBeNull();
    expect((row as any).projectId).not.toBeNull();
  });
});

describe('M-1: no bogus project synthesis for orphan transcripts', () => {
  const opts = { claudeDir };

  test('lossy reversal resolves a real directory from the hash dir', async () => {
    const otherId = 'orphan-resolvable-001';
    const realDir = path.join(fixtureRoot, 'other'); // hyphen-free
    fs.mkdirSync(realDir, { recursive: true });
    writeTranscript(projectHash(realDir), otherId, [
      { type: 'user', message: { role: 'user', content: 'orphan hash touches src/thing.ts' }, uuid: 'u1' },
    ]);
    // No history entry at all for this session.
    const detail = await getClaudeCodeSession(otherId, opts);
    expect(detail).not.toBeNull();
    expect(detail!.repo_path).toBe(realDir);

    const row = await contextSessionRow(`claude-code:${otherId}`);
    expect(row).not.toBeNull(); // attributed to a REAL directory
  });

  test('unresolvable hashes yield empty attribution, not "projects"', async () => {
    const strayId = 'orphan-unresolvable-001';
    writeTranscript('garbage-hash-dir', strayId, [
      { type: 'user', message: { role: 'user', content: 'stray transcript' }, uuid: 'u1' },
    ]);
    const detail = await getClaudeCodeSession(strayId, opts);
    expect(detail).not.toBeNull();
    expect(detail!.repo_path).toBe('');
    expect(detail!.repo_path.toLowerCase()).not.toBe('projects');

    // Guard must prevent ensureProject("garbage-hash-dir") side effects:
    // no context session row may exist for this session.
    const row = await contextSessionRow(`claude-code:${strayId}`);
    expect(row).toBeNull();

    // And no project row was synthesized from the hash-dir basename.
    const { db, schema } = await getDbClient();
    const allProjects = await db.select().from(schema.projects);
    const names = allProjects.map((p: any) => String(p.path ?? p.name ?? '').toLowerCase());
    expect(names).not.toContain('projects');
    expect(names).not.toContain('garbage-hash-dir');
  });

  test('deriveProjectForTranscript rejects non-transcript locations', () => {
    expect(deriveProjectForTranscript(claudeDir, path.join(claudeDir, 'elsewhere', 'x', 's.jsonl'))).toBe('');
  });
});

describe('M-6: message timestamp variants normalize on parse', () => {
  test('numeric-string timestamps parse instead of producing invalid dates', async () => {
    // Some Claude Code versions emit epoch ms as JSON strings. Feeding
    // that raw into `new Date(ms).toISOString()` throws RangeError.
    const isoId = 'iso-ts-001';
    writeTranscript('C--Users-tester-isoproj', isoId, [
      { type: 'user', message: { role: 'user', content: 'isotimestamp marker zebra' }, uuid: 'u1', timestamp: '1735689600000' },
      { type: 'assistant', message: { role: 'assistant', content: 'ack zebra' }, uuid: 'a1', timestamp: '2026-01-05T10:00:05.000Z' },
    ]);
    fs.writeFileSync(
      path.join(claudeDir, 'history.jsonl'),
      (await fs.promises.readFile(path.join(claudeDir, 'history.jsonl'), 'utf-8')) +
        JSON.stringify({
          display: 'ISO timestamp fixture',
          timestamp: 1735764000000,
          project: 'C:\\Users\\tester\\isoproj',
          sessionId: isoId,
        }) +
        '\n'
    );

    const hits = await searchClaudeCodeSessions({ query: 'isotimestamp marker zebra' }, { claudeDir });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      // Must be parseable - a raw string fed into epochToIso would throw
      // or yield "Invalid Date" here.
      expect(Number.isNaN(Date.parse(hit.chunk.timestamp))).toBe(false);
    }
  });
});
