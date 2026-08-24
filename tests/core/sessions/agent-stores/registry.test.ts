/**
 * Tests for the agent-stores registry (v1.6.0, extended in Batch 7).
 *
 * Verifies:
 *   - The registry exposes all 4 stores: opencode, claude-code, codex, gemini
 *   - The opencode store honors `SQUISH_OPENCODE_DISABLED=1`
 *   - The `name` field on each store matches its registry key
 *   - All stores are now fully implemented (not stubs)
 *
 * These tests do NOT touch the user's real agent stores - the
 * `*_DISABLED=1` flags are set so every store reports unavailable.
 */

import { describe, test, expect, beforeAll } from 'bun:test';

import {
  getAgentStore,
  availableAgentStores,
  allAgentStores,
  OpenCodeSessionStore,
  ClaudeCodeSessionStore,
  CodexSessionStore,
  GeminiSessionStore,
} from '../../../../core/sessions/agent-stores/index.js';

beforeAll(() => {
  // Disable all stores during registry tests - we only test registration,
  // not real data access (those tests live in per-store test files).
  process.env.SQUISH_OPENCODE_DISABLED = '1';
  process.env.SQUISH_CLAUDE_DISABLED = '1';
  process.env.SQUISH_CODEX_DISABLED = '1';
  process.env.SQUISH_GEMINI_DISABLED = '1';
});

describe('getAgentStore', () => {
  test('returns an OpenCodeSessionStore with name "opencode"', () => {
    const store = getAgentStore('opencode');
    expect(store).toBeInstanceOf(OpenCodeSessionStore);
    expect(store.name).toBe('opencode');
  });

  test('returns a ClaudeCodeSessionStore with name "claude-code"', () => {
    const store = getAgentStore('claude-code');
    expect(store).toBeInstanceOf(ClaudeCodeSessionStore);
    expect(store.name).toBe('claude-code');
  });

  test('returns a CodexSessionStore with name "codex"', () => {
    const store = getAgentStore('codex');
    expect(store).toBeInstanceOf(CodexSessionStore);
    expect(store.name).toBe('codex');
  });

  test('returns a GeminiSessionStore with name "gemini"', () => {
    const store = getAgentStore('gemini');
    expect(store).toBeInstanceOf(GeminiSessionStore);
    expect(store.name).toBe('gemini');
  });
});

describe('availableAgentStores', () => {
  test('returns exactly the 4 registered names in declaration order', () => {
    const names = availableAgentStores();
    expect(names).toEqual(['opencode', 'claude-code', 'codex', 'gemini']);
  });
});

describe('allAgentStores', () => {
  test('returns one instance per registered agent', () => {
    const stores = allAgentStores();
    expect(stores.length).toBe(4);
    const names = stores.map((s) => s.name);
    expect(names).toEqual(['opencode', 'claude-code', 'codex', 'gemini']);
  });
});

describe('OpenCodeSessionStore (disabled)', () => {
  test('reports available: false when SQUISH_OPENCODE_DISABLED=1', async () => {
    const store = getAgentStore('opencode');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(status.reason).toContain('SQUISH_OPENCODE_DISABLED');
  });
});

describe('ClaudeCodeSessionStore (disabled)', () => {
  test('reports available: false when SQUISH_CLAUDE_DISABLED=1', async () => {
    const store = getAgentStore('claude-code');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(status.reason).toContain('SQUISH_CLAUDE_DISABLED');
  });

  test('returns empty/null for every read method when disabled', async () => {
    const store = getAgentStore('claude-code');
    expect(await store.listSessions()).toEqual([]);
    expect(await store.listSessions({ limit: 5 })).toEqual([]);
    expect(await store.listSessions({ directory_glob: 'anything' })).toEqual([]);
    expect(await store.searchSessions({ query: 'anything' })).toEqual([]);
    expect(await store.getSession('any-id')).toBeNull();
    expect(await store.findRelatedSessions({ repo_path: '/tmp' })).toEqual([]);
    expect(await store.status()).toBeNull();
  });
});

describe('CodexSessionStore (disabled)', () => {
  test('reports available: false when SQUISH_CODEX_DISABLED=1', async () => {
    const store = getAgentStore('codex');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(status.reason).toContain('SQUISH_CODEX_DISABLED');
  });

  test('returns empty/null for every read method when disabled', async () => {
    const store = getAgentStore('codex');
    expect(await store.listSessions()).toEqual([]);
    expect(await store.listSessions({ limit: 5 })).toEqual([]);
    expect(await store.listSessions({ directory_glob: 'anything' })).toEqual([]);
    expect(await store.searchSessions({ query: 'anything' })).toEqual([]);
    expect(await store.getSession('any-id')).toBeNull();
    expect(await store.findRelatedSessions({ repo_path: '/tmp' })).toEqual([]);
    expect(await store.status()).toBeNull();
  });
});

describe('GeminiSessionStore (disabled)', () => {
  test('reports available: false when SQUISH_GEMINI_DISABLED=1', async () => {
    const store = getAgentStore('gemini');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(status.reason).toContain('SQUISH_GEMINI_DISABLED');
  });

  test('returns empty/null for every read method when disabled', async () => {
    const store = getAgentStore('gemini');
    expect(await store.listSessions()).toEqual([]);
    expect(await store.listSessions({ limit: 5 })).toEqual([]);
    expect(await store.searchSessions({ query: 'anything' })).toEqual([]);
    expect(await store.getSession('any-id')).toBeNull();
    expect(await store.findRelatedSessions({ files: ['a.ts'] })).toEqual([]);
    expect(await store.status()).toBeNull();
  });
});
