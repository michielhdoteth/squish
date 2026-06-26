/**
 * Tests for LLM client helper
 * TDD: Write tests first, then implement
 *
 * Config is controlled via env vars (SQUISH_LLM_ENABLED, SQUISH_LLM_ENDPOINT,
 * etc.) instead of mock.module. config.ts reads env vars lazily through getters,
 * so setting process.env before each call is sufficient.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { callLLM } from '../../../core/llm/client.js';

// ─── Env var control ──────────────────────────────────────────────────────────
// Save/restore env vars to avoid cross-test pollution.
const savedEnv: Record<string, string | undefined> = {};

function setLlmConfig(opts: {
  enabled?: boolean;
  endpoint?: string;
  extractionModel?: string;
  apiKey?: string;
}) {
  if (opts.enabled !== undefined) {
    savedEnv.SQUISH_LLM_ENABLED = process.env.SQUISH_LLM_ENABLED;
    process.env.SQUISH_LLM_ENABLED = String(opts.enabled);
  }
  if (opts.endpoint !== undefined) {
    savedEnv.SQUISH_LLM_ENDPOINT = process.env.SQUISH_LLM_ENDPOINT;
    process.env.SQUISH_LLM_ENDPOINT = opts.endpoint;
  }
  if (opts.extractionModel !== undefined) {
    savedEnv.SQUISH_LLM_EXTRACTION_MODEL = process.env.SQUISH_LLM_EXTRACTION_MODEL;
    process.env.SQUISH_LLM_EXTRACTION_MODEL = opts.extractionModel;
  }
  if (opts.apiKey !== undefined) {
    savedEnv.SQUISH_LLM_API_KEY = process.env.SQUISH_LLM_API_KEY;
    process.env.SQUISH_LLM_API_KEY = opts.apiKey;
  }
}

function restoreLlmConfig() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('callLLM', () => {
  afterAll(() => {
    restoreLlmConfig();
  });

  test('returns null when LLM is not enabled', async () => {
    setLlmConfig({ enabled: false });
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('returns null when fetch fails (no endpoint configured)', async () => {
    setLlmConfig({
      enabled: true,
      endpoint: 'http://localhost:99999',
      extractionModel: 'gpt-4o-mini',
      apiKey: '',
    });
    // Should fail silently and return null since endpoint is unreachable
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('returns null when LLM throws (timeout simulation)', async () => {
    setLlmConfig({
      enabled: true,
      endpoint: 'http://localhost:99999',
      extractionModel: 'gpt-4o-mini',
    });
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('never blocks longer than timeout', { timeout: 20000 }, async () => {
    setLlmConfig({
      enabled: true,
      endpoint: 'http://10.255.255.1', // Non-routable IP
      extractionModel: 'test-model',
    });

    const start = Date.now();
    const result = await callLLM('test prompt');
    const elapsed = Date.now() - start;

    // Should have timed out and returned null, not hung forever
    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(15000); // Should be well under 15s
  });
});

describe('callLLM endpoint construction', () => {
  afterAll(() => {
    restoreLlmConfig();
  });

  test('handles endpoints without /v1 suffix', async () => {
    setLlmConfig({
      enabled: true,
      endpoint: 'http://localhost:59123',
      extractionModel: 'test-model',
      apiKey: '',
    });
    // This will fail to connect (no server), but should not crash
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('handles endpoints with /v1 suffix', async () => {
    setLlmConfig({
      enabled: true,
      endpoint: 'http://localhost:59124/v1',
      extractionModel: 'test-model',
      apiKey: '',
    });
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });
});
