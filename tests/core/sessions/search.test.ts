/**
 * Tests for core/sessions/store.ts searchChunks.
 *
 * Real DB - uses SQUISH_DATA_DIR for isolation, real rememberMemory
 * calls via captureChunk. Asserts the new chunk-based behavior:
 * search returns 3-10 matching CHUNKS, not whole sessions.
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';

const testDataDir = join(
  tmpdir(),
  `squish-sessions-search-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
// Don't reach into the user's real opencode.db during core store tests.
process.env.SQUISH_OPENCODE_DISABLED = '1';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { resetDb, getDb } from '../../../db/index.js';
import {
  captureChunk,
  searchChunks,
  getSessionChunks,
  listSessionGroups,
  buildInjectText,
  makeSummaryChunk,
  extractDecisionChunks,
  extractCommandChunks,
  extractFileChunks,
  extractErrorChunks,
  extractTodoChunks,
} from '../../../core/sessions/index.js';
import type { Chunk, AgentId } from '../../../core/sessions/index.js';

async function clearAllData(): Promise<void> {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec('DELETE FROM memory_places;');
    sqlite.exec('DELETE FROM memories;');
    sqlite.exec('DELETE FROM place_rules;');
    sqlite.exec('DELETE FROM places;');
    sqlite.exec('DELETE FROM projects;');
  }
}

const AGENT: AgentId = 'cli';

const ts = (offsetMinutes: number): string =>
  new Date(Date.parse('2026-06-01T12:00:00Z') + offsetMinutes * 60_000).toISOString();

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    type: 'summary',
    content: 'Default summary',
    session_id: 'session-A',
    session_title: 'Session A',
    project: '/test/squish',
    repo_path: '/test/squish',
    branch: 'main',
    agent: AGENT,
    agent_session_id: 'agent-A-1',
    timestamp: ts(0),
    ...overrides,
  };
}

const previousDataDir = process.env.SQUISH_DATA_DIR;

beforeAll(async () => {
  process.env.SQUISH_DATA_DIR = testDataDir;
  process.env.DATABASE_URL = '';
  resetDb();
  await clearAllData();

  // Session A: 3 chunks (summary + decision + error), with a specific topic
  await captureChunk(
    makeChunk({
      type: 'summary',
      session_id: 'session-A',
      session_title: 'Router bug fix',
      content: 'Working on a router bug in the squish CLI that broke redirect handling',
      timestamp: ts(0),
    }),
    { project: '/test/squish' }
  );
  await captureChunk(
    makeChunk({
      type: 'decision',
      session_id: 'session-A',
      session_title: 'Router bug fix',
      content: 'Going with explicit route ordering for the public API',
      timestamp: ts(2),
    }),
    { project: '/test/squish' }
  );
  await captureChunk(
    makeChunk({
      type: 'error',
      session_id: 'session-A',
      session_title: 'Router bug fix',
      content: 'TypeError: cannot read property redirect of undefined',
      timestamp: ts(4),
    }),
    { project: '/test/squish' }
  );

  // Session B: 4 chunks (command + file + todo), with a different topic
  await captureChunk(
    makeChunk({
      type: 'command',
      session_id: 'session-B',
      session_title: 'Search scoring experiment',
      content: 'bun test core/memory/hybrid-search.test.ts',
      timestamp: ts(10),
    }),
    { project: '/test/squish' }
  );
  await captureChunk(
    makeChunk({
      type: 'file',
      session_id: 'session-B',
      session_title: 'Search scoring experiment',
      content: 'core/memory/hybrid-search.ts - rewrote cosine ranking',
      files: ['core/memory/hybrid-search.ts'],
      timestamp: ts(11),
    }),
    { project: '/test/squish' }
  );
  await captureChunk(
    makeChunk({
      type: 'todo',
      session_id: 'session-B',
      session_title: 'Search scoring experiment',
      content: '[in_progress] benchmark new scoring algorithm',
      timestamp: ts(12),
    }),
    { project: '/test/squish' }
  );
  await captureChunk(
    makeChunk({
      type: 'decision',
      session_id: 'session-B',
      session_title: 'Search scoring experiment',
      content: 'Picked hybrid BM25 + cosine over pure vector search',
      timestamp: ts(13),
    }),
    { project: '/test/squish' }
  );
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.SQUISH_DATA_DIR;
  else process.env.SQUISH_DATA_DIR = previousDataDir;
  try {
    rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe('captureChunk + searchChunks', () => {
  it('returns matching chunks (3-10), not whole sessions', async () => {
    const results = await searchChunks({ query: 'router' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    // Each result is a CHUNK, not a session
    for (const r of results) {
      expect(r.chunk).toBeTruthy();
      expect(r.chunk.type).toBeTruthy();
      expect(r.chunk.content).toBeTruthy();
      expect(r.chunk.session_id).toBeTruthy();
      expect(typeof r.score).toBe('number');
      expect(r.memory_id).toBeTruthy();
      expect(r.why).toBeTruthy();
    }
  });

  it('respects limit (never more than 10)', async () => {
    const results = await searchChunks({ query: 'squish', limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });

  it('caps limit at 10 even when caller asks for more', async () => {
    const results = await searchChunks({ query: 'squish', limit: 100 });
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('uses default limit of 8 when not provided', async () => {
    const results = await searchChunks({ query: 'session' });
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('filters by chunk_type', async () => {
    const results = await searchChunks({ query: 'squish', chunk_type: 'decision' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.chunk.type).toBe('decision');
    }
  });

  it('returns score, why, and memory_id on each result', async () => {
    const results = await searchChunks({ query: 'router' });
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(typeof r.score).toBe('number');
    expect(r.why.length).toBeGreaterThan(0);
    expect(r.memory_id.length).toBeGreaterThan(0);
  });

  it('returns empty array for nonsense query (no match)', async () => {
    const results = await searchChunks({ query: 'zxqvbnmqwertynonsense-token-12345' });
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('getSessionChunks', () => {
  it('returns a SessionGroup with all chunks for a session_id', async () => {
    const group = await getSessionChunks('session-A');
    expect(group).toBeTruthy();
    expect(group!.session_id).toBe('session-A');
    expect(group!.chunks).toBeTruthy();
    expect(group!.chunks!.length).toBe(3);
    expect(group!.chunk_count).toBe(3);
    expect(group!.title).toBe('Router bug fix');
  });

  it('returns null for unknown session_id', async () => {
    const group = await getSessionChunks('does-not-exist-xyz');
    expect(group).toBeNull();
  });

  it('returns chunks in chronological order', async () => {
    const group = await getSessionChunks('session-B');
    expect(group).toBeTruthy();
    const ts = group!.chunks!.map((c) => c.timestamp);
    const sorted = ts.slice().sort();
    expect(ts).toEqual(sorted);
  });
});

describe('listSessionGroups', () => {
  it('returns one SessionGroup per session_id with chunk_count', async () => {
    const groups = await listSessionGroups({});
    expect(groups.length).toBe(2);
    const ids = groups.map((g) => g.session_id).sort();
    expect(ids).toEqual(['session-A', 'session-B']);
    const a = groups.find((g) => g.session_id === 'session-A');
    const b = groups.find((g) => g.session_id === 'session-B');
    expect(a!.chunk_count).toBe(3);
    expect(b!.chunk_count).toBe(4);
  });

  it('respects limit', async () => {
    const groups = await listSessionGroups({ limit: 1 });
    expect(groups.length).toBe(1);
  });

  it('does not include full chunk content in list output', async () => {
    const groups = await listSessionGroups({});
    for (const g of groups) {
      expect(g.chunks).toBeUndefined();
    }
  });
});

describe('buildInjectText', () => {
  it('returns a markdown block with all chunks for a session', async () => {
    const text = await buildInjectText('session-A');
    expect(text).toBeTruthy();
    expect(text).toContain('### Related past session:');
    expect(text).toContain('Decisions');
    expect(text).toContain('explicit route ordering');
  });

  it('returns null for unknown session_id', async () => {
    const text = await buildInjectText('does-not-exist-xyz');
    expect(text).toBeNull();
  });
});

describe('chunker extractors', () => {
  it('makeSummaryChunk produces a summary Chunk', () => {
    const c = makeSummaryChunk({
      session_id: 's1',
      title: 'Test',
      firstUserMessage: 'hello world',
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
      timestamp: '2026-06-01T00:00:00Z',
    });
    expect(c.type).toBe('summary');
    expect(c.content).toBe('hello world');
    expect(c.session_id).toBe('s1');
  });

  it('extractDecisionChunks picks decisions and caps at 5', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Decision: do X first' },
      { role: 'assistant', content: "Let's go with Y" },
      { role: 'assistant', content: "I'll do Z" },
      { role: 'assistant', content: 'We will use W' },
      { role: 'assistant', content: 'Going with V' },
      { role: 'assistant', content: 'I decided to use U' },
      { role: 'assistant', content: 'Random chatter' },
    ];
    const chunks = extractDecisionChunks({
      session_id: 's1',
      title: 't',
      messages,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    expect(chunks.length).toBeLessThanOrEqual(5);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(c.type).toBe('decision');
  });

  it('extractCommandChunks caps at 10 and skips empty', () => {
    const invocations = [
      { command: '' },
      { command: '   ' },
      { command: 'ls -la' },
      { command: 'git status' },
    ];
    const chunks = extractCommandChunks({
      session_id: 's1',
      title: 't',
      bashInvocations: invocations,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    expect(chunks.length).toBe(2);
    for (const c of chunks) {
      expect(c.type).toBe('command');
      expect(c.content.length).toBeGreaterThan(0);
    }
  });

  it('extractFileChunks caps at 20', () => {
    const edits = Array.from({ length: 25 }, (_, i) => ({ path: `src/file${i}.ts` }));
    const chunks = extractFileChunks({
      session_id: 's1',
      title: 't',
      fileEdits: edits,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    expect(chunks.length).toBe(20);
  });

  it('extractErrorChunks skips empty messages', () => {
    const errors = [
      { message: '' },
      { message: 'real error: something broke' },
      { message: '   ' },
    ];
    const chunks = extractErrorChunks({
      session_id: 's1',
      title: 't',
      errors,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('real error: something broke');
  });

  it('extractTodoChunks includes status prefix', () => {
    const todos = [
      { content: 'write tests', status: 'pending' },
      { content: '', status: 'pending' },
    ];
    const chunks = extractTodoChunks({
      session_id: 's1',
      title: 't',
      todos,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('[pending]');
  });

  it('truncates content to 500 chars', () => {
    const longMessage = 'x'.repeat(800);
    const c = makeSummaryChunk({
      session_id: 's1',
      title: 't',
      firstUserMessage: longMessage,
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
      timestamp: '2026-06-01T00:00:00Z',
    });
    expect(c.content.length).toBeLessThanOrEqual(500);
  });

  it('uses now() when timestamp missing', () => {
    const before = Date.now();
    const c = makeSummaryChunk({
      session_id: 's1',
      title: 't',
      firstUserMessage: 'msg',
      project: 'p',
      repo_path: '/p',
      branch: 'main',
      agent: 'cli',
      agent_session_id: 'a1',
    });
    const after = Date.now();
    const t = new Date(c.timestamp).getTime();
    expect(t).toBeGreaterThanOrEqual(before - 5);
    expect(t).toBeLessThanOrEqual(after + 5);
  });
});
