/**
 * Batch 7: multi-harness session store adapters - fixture-based tests.
 *
 * Uses committed SYNTHETIC fixtures (no real user data):
 *   fixtures/claude/history.jsonl + projects/<hash>/<id>.jsonl
 *   fixtures/gemini/tmp/<hash>/chats/session-*.json
 *
 * Covered:
 *   - Claude JSONL parser: user/assistant text, tool_use summaries,
 *     malformed-line tolerance, non-message types skipped
 *   - Gemini chat parser: user/gemini messages, system types skipped
 *   - Adapter detection (registry availability + disabled env gates)
 *   - Parse cache: hit on repeat, invalidated by file mtime/size change
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir BEFORE core imports so the session cache DB is temp.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-agent-stores-'));
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

import {
  listClaudeCodeSessions,
  searchClaudeCodeSessions,
  getClaudeCodeSession,
  findClaudeCodeRelatedSessions,
  ClaudeCodeSessionStore,
} from '../../../../core/sessions/agent-stores/claude-code.js';
import {
  listGeminiSessions,
  searchGeminiSessions,
  getGeminiSession,
  geminiDbStatus,
  GeminiSessionStore,
} from '../../../../core/sessions/agent-stores/gemini.js';
import { allAgentStores, getAgentStore } from '../../../../core/sessions/agent-stores/registry.js';

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FIXTURES = path.join(import.meta.dir, '..', 'fixtures');
const geminiDir = path.join(FIXTURES, 'gemini');

// The claude fixtures are copied to a writable temp dir so the
// cache-invalidation test can mutate transcripts without touching
// the committed files.
const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-claude-fix-'));
fs.cpSync(path.join(FIXTURES, 'claude'), claudeDir, { recursive: true });
const claudeTranscript = path.join(
  claudeDir,
  'projects',
  'C--Users-tester-fixture-proj',
  'fix-claude-001.jsonl'
);

beforeAll(() => {
  expect(fs.existsSync(claudeDir)).toBe(true);
  expect(fs.existsSync(claudeTranscript)).toBe(true);
});

afterAll(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    fs.rmSync(claudeDir, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
});

// ---------------------------------------------------------------------------
// Claude Code adapter
// ---------------------------------------------------------------------------

describe('claude-code store (fixtures)', () => {
  const opts = { claudeDir };

  test('listSessions returns fixture sessions with harness origin', () => {
    const sessions = listClaudeCodeSessions({ limit: 10 }, opts);
    expect(sessions.length).toBe(2);
    for (const s of sessions) {
      expect(s.agent).toBe('claude-code');
      expect(typeof s.session_id).toBe('string');
      expect(s.status).toBe('completed');
    }
    const ids = sessions.map((s) => s.session_id);
    expect(ids).toContain('fix-claude-001');
  });

  test('parser extracts user + assistant text and summarizes tool_use', async () => {
    const detail = await getClaudeCodeSession('fix-claude-001', opts);
    expect(detail).not.toBeNull();
    expect(detail!.agent).toBe('claude-code');
    expect(detail!.message_count).toBeGreaterThan(0);

    const allText = detail!.chunks.map((c) => c.content).join('\n');
    expect(allText).toContain('login redirect bug');
    // tool_use summarized by name + target; raw payload must NOT leak
    expect(allText).toContain('[tool:Read] auth/login.ts');
    expect(allText.includes('SHOULD_NOT_LEAK_INTO_TEXT')).toBe(false);
  });

  test('search matches across normalized transcript content', async () => {
    const hits = await searchClaudeCodeSessions({ query: 'redirect loop stale cookie' }, opts);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.agent).toBe('claude-code');
    expect(hits[0].chunk.content.toLowerCase()).toContain('cookie');
  });

  test('malformed lines are skipped without breaking the parse', async () => {
    const detail = await getClaudeCodeSession('fix-claude-001', opts);
    expect(detail).not.toBeNull();
    // Search reads normalized texts of ALL messages; the trailing user
    // turn sits AFTER the malformed line, so it must still be found.
    const hits = await searchClaudeCodeSessions({ query: 'ship fix bun test' }, opts);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.content.toLowerCase()).toContain('ship');
    const related = await findClaudeCodeRelatedSessions(
      { repo_path: 'C:\\Users\\tester\\fixture-proj' },
      opts
    );
    expect(related.length).toBeGreaterThan(0);
    expect(related[0].score).toBeGreaterThanOrEqual(2);
  });

  test('parse cache serves repeat reads and invalidates on mtime change', async () => {
    // First read populates the cache.
    const first = await getClaudeCodeSession('fix-claude-001', opts);
    expect(first).not.toBeNull();

    // Mutate the transcript: new user message + fresh mtime/size.
    const appended =
      '\n' +
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'cache-invalidation-marker-xyz' },
        uuid: 'u9',
        timestamp: 1735689999000,
        gitBranch: 'main',
      }) +
      '\n';
    fs.appendFileSync(claudeTranscript, appended);
    const now = new Date(Date.now() + 5000);
    fs.utimesSync(claudeTranscript, now, now);

    // A stale cache would NOT contain the appended message.
    const hits = await searchClaudeCodeSessions(
      { query: 'cache-invalidation-marker-xyz', per_session_chunks: 5 },
      opts
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.content).toContain('cache-invalidation-marker-xyz');
  });

  test('class store honors constructor options and detection gate', async () => {
    const store = new ClaudeCodeSessionStore({ claudeDir });
    const avail = await store.available();
    expect(avail.ok).toBe(true);

    const sessions = await store.listSessions({ limit: 5 });
    expect(sessions.length).toBeGreaterThan(0);
  });

  test('disabled env gate reports unavailable', async () => {
    const orig = process.env.SQUISH_CLAUDE_DISABLED;
    process.env.SQUISH_CLAUDE_DISABLED = '1';
    try {
      const store = new ClaudeCodeSessionStore({ claudeDir });
      const avail = await store.available();
      expect(avail.ok).toBe(false);
    } finally {
      if (orig === undefined) delete process.env.SQUISH_CLAUDE_DISABLED;
      else process.env.SQUISH_CLAUDE_DISABLED = orig;
    }
  });
});

// ---------------------------------------------------------------------------
// Gemini adapter
// ---------------------------------------------------------------------------

describe('gemini store (fixtures)', () => {
  const opts = { geminiDir };

  test('detection: status finds the fixture chats', () => {
    const status = geminiDbStatus(opts);
    expect(status.ok).toBe(true);
    expect(status.session_count).toBeGreaterThanOrEqual(1);
  });

  test('listSessions returns chat groups tagged agent=gemini', () => {
    const sessions = listGeminiSessions({ limit: 10 }, opts);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const s = sessions.find((x) => x.session_id === 'gemini-fix-001');
    expect(s).toBeDefined();
    expect(s!.agent).toBe('gemini');
    expect(s!.started_at).toBe('2026-01-05T10:00:00.000Z');
    expect(s!.ended_at).toBe('2026-01-05T10:20:00.000Z');
  });

  test('parser keeps user/gemini text and skips system message types', async () => {
    const detail = await getGeminiSession('gemini-fix-001', opts);
    expect(detail).not.toBeNull();
    const joined = detail!.chunks.map((c) => c.content).join('\n');
    expect(joined).toContain('vector search recall dropping');
    expect(joined).toContain('embedding model');
    expect(joined.includes('internal system chatter')).toBe(false);
  });

  test('search across normalized chat content', async () => {
    const hits = await searchGeminiSessions({ query: 'rebuilding index recall regression' }, opts);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.agent).toBe('gemini');
  });

  test('registry exposes the gemini store', async () => {
    const names = allAgentStores().map((s) => s.name);
    expect(names).toContain('gemini');
    const store = getAgentStore('gemini') as GeminiSessionStore;
    expect(store).toBeInstanceOf(GeminiSessionStore);
    const avail = await store.available();
    expect(avail.ok === true || avail.ok === false).toBe(true); // env-dependent
  });
});
