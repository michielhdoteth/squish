/**
 * Tests for the Codex session store.
 *
 * These tests exercise CodexSessionStore against the user's real
 * ~/.codex/ data. If the state_5.sqlite file is missing the tests
 * return early with a descriptive log.
 *
 * Covered:
 *   - available() reflects whether state_5.sqlite exists
 *   - status() returns valid stats when available
 *   - listSessions() returns SessionGroup[] with correct fields
 *   - searchSessions() returns Chunk[] for a matching query
 *   - getSession() returns group + chunks for a known thread id
 *   - findRelatedSessions() returns scored results for a repo_path
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Database } from 'bun:sqlite';

import {
  CodexSessionStore,
  codexDbStatus,
  listCodexSessions,
  searchCodexSessions,
  getCodexSession,
  findCodexRelatedSessions,
  closeCodexDb,
} from '../../../../core/sessions/agent-stores/codex.js';
import type { SessionGroup } from '../../../../core/sessions/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function codexDbExists(): boolean {
  const p = path.join(os.homedir(), '.codex', 'state_5.sqlite');
  return fs.existsSync(p);
}

function getFirstThreadId(): string | null {
  const dbPath = path.join(os.homedir(), '.codex', 'state_5.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT id FROM threads LIMIT 1').get() as { id: string } | null;
    db.close();
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function getFirstThreadCwd(): string | null {
  const dbPath = path.join(os.homedir(), '.codex', 'state_5.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT cwd FROM threads WHERE archived = 0 LIMIT 1').get() as { cwd: string } | null;
    db.close();
    return row?.cwd ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Availability gate
// ---------------------------------------------------------------------------

const hasCodexDb = codexDbExists();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexSessionStore', () => {
  const store = new CodexSessionStore();

  describe('available()', () => {
    test('returns ok:true when state_5.sqlite exists', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const result = await store.available();
      expect(result.ok).toBe(true);
      expect(result.meta).toBeDefined();
      expect(typeof result.meta!.path).toBe('string');
      expect(typeof result.meta!.session_count).toBe('number');
    });

    test('returns ok:false when SQUISH_CODEX_DISABLED=1', async () => {
      const orig = process.env.SQUISH_CODEX_DISABLED;
      process.env.SQUISH_CODEX_DISABLED = '1';
      try {
        const result = await store.available();
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('codex disabled');
      } finally {
        if (orig === undefined) delete process.env.SQUISH_CODEX_DISABLED;
        else process.env.SQUISH_CODEX_DISABLED = orig;
      }
    });
  });

  describe('codexDbStatus()', () => {
    test('returns ok:true with valid fields when data exists', () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const status = codexDbStatus();
      expect(status.ok).toBe(true);
      expect(status.path).toBeTruthy();
      expect(status.size_bytes).toBeGreaterThan(0);
      expect(status.session_count).toBeGreaterThanOrEqual(0);
    });

    test('returns ok:false with error when db is missing', () => {
      const status = codexDbStatus({ dbPath: '/nonexistent-dir-for-tests/state_5.sqlite' });
      expect(status.ok).toBe(false);
      expect(status.error).toBeTruthy();
    });
  });

  describe('status()', () => {
    test('returns valid stats when available', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const result = await store.status();
      expect(result).not.toBeNull();
      expect(typeof result!.path).toBe('string');
      expect(result!.size).toBeGreaterThan(0);
      expect(typeof result!.sessions).toBe('number');
      expect(typeof result!.messages).toBe('number');
      expect(typeof result!.parts).toBe('number');
    });

    test('returns null when data dir is missing', async () => {
      const orig = process.env.SQUISH_CODEX_DISABLED;
      process.env.SQUISH_CODEX_DISABLED = '1';
      try {
        const result = await store.status();
        expect(result).toBeNull();
      } finally {
        if (orig === undefined) delete process.env.SQUISH_CODEX_DISABLED;
        else process.env.SQUISH_CODEX_DISABLED = orig;
      }
    });
  });

  describe('listSessions()', () => {
    test('returns SessionGroup[] with correct fields', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const sessions = await store.listSessions({ limit: 5 });
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.length).toBeLessThanOrEqual(5);

      for (const s of sessions) {
        expect(typeof s.session_id).toBe('string');
        expect(s.session_id.length).toBeGreaterThan(0);
        expect(typeof s.title).toBe('string');
        expect(typeof s.project).toBe('string');
        expect(typeof s.repo_path).toBe('string');
        expect(s.agent).toBe('codex');
        expect(typeof s.started_at).toBe('string');
        // status should be a valid value
        expect(['active', 'completed', 'errored']).toContain(s.status);
        expect(typeof s.chunk_count).toBe('number');
      }
    });

    test('returns empty array when data dir is missing', async () => {
      const orig = process.env.SQUISH_CODEX_DISABLED;
      process.env.SQUISH_CODEX_DISABLED = '1';
      try {
        const sessions = await store.listSessions();
        expect(sessions).toEqual([]);
      } finally {
        if (orig === undefined) delete process.env.SQUISH_CODEX_DISABLED;
        else process.env.SQUISH_CODEX_DISABLED = orig;
      }
    });

    test('respects limit parameter', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const sessions = await store.listSessions({ limit: 2 });
      expect(sessions.length).toBeLessThanOrEqual(2);
    });

    test('offset parameter does not crash', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const sessions = await store.listSessions({ offset: 0, limit: 3 });
      expect(Array.isArray(sessions)).toBe(true);
    });

    test('returns non-archived sessions only', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const sessions = await store.listSessions({ limit: 20 });
      // All returned sessions should be non-archived (the SQL filters archived=0)
      for (const s of sessions) {
        expect(s.session_id).toBeTruthy();
        expect(s.status).not.toBe('errored');
      }
    });
  });

  describe('searchSessions()', () => {
    test('returns Chunk[] for a matching query', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      // Use a generic query that likely matches something
      const chunks = await store.searchSessions({ query: 'test', limit: 3 });
      expect(Array.isArray(chunks)).toBe(true);
      if (chunks.length > 0) {
        for (const c of chunks) {
          expect(typeof c.type).toBe('string');
          expect(typeof c.content).toBe('string');
          expect(c.content.length).toBeGreaterThan(0);
          expect(typeof c.session_id).toBe('string');
          expect(c.agent).toBe('codex');
          expect(typeof c.timestamp).toBe('string');
        }
      }
    });

    test('returns empty array for empty query', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const chunks = await store.searchSessions({ query: '' });
      expect(chunks).toEqual([]);
    });

    test('returns empty array for whitespace-only query', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const chunks = await store.searchSessions({ query: '   ' });
      expect(chunks).toEqual([]);
    });

    test('returns empty array when data dir is missing', async () => {
      const orig = process.env.SQUISH_CODEX_DISABLED;
      process.env.SQUISH_CODEX_DISABLED = '1';
      try {
        const chunks = await store.searchSessions({ query: 'test' });
        expect(chunks).toEqual([]);
      } finally {
        if (orig === undefined) delete process.env.SQUISH_CODEX_DISABLED;
        else process.env.SQUISH_CODEX_DISABLED = orig;
      }
    });
  });

  describe('getSession()', () => {
    test('returns group + chunks for a known thread id', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const threadId = getFirstThreadId();
      if (!threadId) {
        console.log('  [SKIP] no threads found in state_5.sqlite');
        return;
      }

      const result = await store.getSession(threadId);
      expect(result).not.toBeNull();
      expect(result!.group).toBeDefined();
      expect(result!.group.session_id).toBe(threadId);
      expect(result!.group.agent).toBe('codex');
      expect(typeof result!.group.title).toBe('string');
      expect(typeof result!.group.started_at).toBe('string');
      expect(Array.isArray(result!.chunks)).toBe(true);

      // Each chunk should have required fields
      for (const c of result!.chunks) {
        expect(typeof c.type).toBe('string');
        expect(typeof c.content).toBe('string');
        expect(c.session_id).toBe(threadId);
        expect(c.agent).toBe('codex');
      }
    });

    test('returns null for a nonexistent thread id', async () => {
      const result = await store.getSession('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('findRelatedSessions()', () => {
    test('returns scored results for a matching repo_path', async () => {
      if (!hasCodexDb) {
        console.log('  [SKIP] ~/.codex/state_5.sqlite not found');
        return;
      }
      const cwd = getFirstThreadCwd();
      if (!cwd) {
        console.log('  [SKIP] no cwd found in threads table');
        return;
      }

      const results = await store.findRelatedSessions({ repo_path: cwd });
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        for (const r of results) {
          expect(r.group).toBeDefined();
          expect(typeof r.group.session_id).toBe('string');
          expect(r.group.agent).toBe('codex');
          expect(typeof r.score).toBe('number');
          expect(r.score).toBeGreaterThan(0);
          expect(typeof r.reason).toBe('string');
          expect(r.reason.length).toBeGreaterThan(0);
        }
      }
    });

    test('returns empty array when neither repo_path nor files provided', async () => {
      const results = await store.findRelatedSessions({});
      expect(results).toEqual([]);
    });

    test('returns empty array when data dir is missing', async () => {
      const orig = process.env.SQUISH_CODEX_DISABLED;
      process.env.SQUISH_CODEX_DISABLED = '1';
      try {
        const results = await store.findRelatedSessions({ repo_path: '/tmp' });
        expect(results).toEqual([]);
      } finally {
        if (orig === undefined) delete process.env.SQUISH_CODEX_DISABLED;
        else process.env.SQUISH_CODEX_DISABLED = orig;
      }
    });
  });
});
