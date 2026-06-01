/**
 * Tests for the agent-stores registry (v1.5.5).
 *
 * Verifies:
 *   - The registry exposes all 3 stores: opencode, claude-code, codex
 *   - The claude-code and codex stubs return `available: false` and
 *     empty/null for every read method
 *   - The opencode store honors `SQUISH_OPENCODE_DISABLED=1`
 *   - The `name` field on each store matches its registry key
 *
 * These tests do NOT touch the user's real opencode.db - the
 * `SQUISH_OPENCODE_DISABLED=1` flag is set so the opencode store
 * reports unavailable. Tests that DO need a real opencode.db live
 * elsewhere (smoke tests via the CLI on the user's machine).
 */

import { describe, test, expect, beforeAll } from 'bun:test';

import {
  getAgentStore,
  availableAgentStores,
  allAgentStores,
  OpenCodeSessionStore,
  ClaudeCodeSessionStore,
  CodexSessionStore,
} from '../../../../core/sessions/agent-stores/index.js';

beforeAll(() => {
  // Make sure the opencode store reports unavailable during these
  // tests. The user's real opencode.db must never be read from a
  // test file.
  process.env.SQUISH_OPENCODE_DISABLED = '1';
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
});

describe('availableAgentStores', () => {
  test('returns exactly the 3 registered names in declaration order', () => {
    const names = availableAgentStores();
    expect(names).toEqual(['opencode', 'claude-code', 'codex']);
  });
});

describe('allAgentStores', () => {
  test('returns one instance per registered agent', () => {
    const stores = allAgentStores();
    expect(stores.length).toBe(3);
    const names = stores.map((s) => s.name);
    expect(names).toEqual(['opencode', 'claude-code', 'codex']);
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

describe('ClaudeCodeSessionStore (stub)', () => {
  test('reports available: false with reason', async () => {
    const store = getAgentStore('claude-code');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(typeof status.reason).toBe('string');
    expect(status.reason!.length).toBeGreaterThan(0);
  });

  test('returns empty/null for every read method', async () => {
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

describe('CodexSessionStore (stub)', () => {
  test('reports available: false with reason', async () => {
    const store = getAgentStore('codex');
    const status = await store.available();
    expect(status.ok).toBe(false);
    expect(typeof status.reason).toBe('string');
    expect(status.reason!.length).toBeGreaterThan(0);
  });

  test('returns empty/null for every read method', async () => {
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
