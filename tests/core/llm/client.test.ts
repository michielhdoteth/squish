/**
 * Tests for LLM client helper
 * TDD: Write tests first, then implement
 */

import { describe, test, expect, mock } from 'bun:test';

// Mock config module before importing
const mockConfig = {
  llmEnabled: false,
  llmEndpoint: '',
  llmExtractionModel: '',
  llmApiKey: '',
};

mock.module('../../../config.js', () => ({
  config: mockConfig,
  default: mockConfig,
}));

describe('callLLM', () => {
  test('returns null when LLM is not enabled', async () => {
    mockConfig.llmEnabled = false;
    const { callLLM } = await import('../../../core/llm/client.js');
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('returns null when fetch fails (no endpoint configured)', async () => {
    mockConfig.llmEnabled = true;
    mockConfig.llmEndpoint = 'http://localhost:99999';
    mockConfig.llmExtractionModel = 'gpt-4o-mini';
    mockConfig.llmApiKey = '';

    const { callLLM } = await import('../../../core/llm/client.js');
    // Should fail silently and return null since endpoint is unreachable
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('returns null when LLM throws (timeout simulation)', async () => {
    mockConfig.llmEnabled = true;
    mockConfig.llmEndpoint = 'http://localhost:99999';
    mockConfig.llmExtractionModel = 'gpt-4o-mini';

    const { callLLM } = await import('../../../core/llm/client.js');
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('never blocks longer than timeout', { timeout: 20000 }, async () => {
    mockConfig.llmEnabled = true;
    mockConfig.llmEndpoint = 'http://10.255.255.1'; // Non-routable IP
    mockConfig.llmExtractionModel = 'test-model';

    const { callLLM } = await import('../../../core/llm/client.js');
    const start = Date.now();
    const result = await callLLM('test prompt');
    const elapsed = Date.now() - start;

    // Should have timed out and returned null, not hung forever
    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(15000); // Should be well under 15s
  });
});

describe('callLLM endpoint construction', () => {
  test('handles endpoints without /v1 suffix', async () => {
    mockConfig.llmEnabled = true;
    mockConfig.llmEndpoint = 'http://localhost:59123';
    mockConfig.llmExtractionModel = 'test-model';
    mockConfig.llmApiKey = '';

    const { callLLM } = await import('../../../core/llm/client.js');
    // This will fail to connect (no server), but should not crash
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });

  test('handles endpoints with /v1 suffix', async () => {
    mockConfig.llmEnabled = true;
    mockConfig.llmEndpoint = 'http://localhost:59124/v1';
    mockConfig.llmExtractionModel = 'test-model';
    mockConfig.llmApiKey = '';

    const { callLLM } = await import('../../../core/llm/client.js');
    const result = await callLLM('test prompt');
    expect(result).toBeNull();
  });
});
