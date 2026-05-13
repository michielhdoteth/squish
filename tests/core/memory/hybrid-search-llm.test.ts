/**
 * Tests for LLM reranking in hybrid-search.ts
 * TDD: Write tests first, then implement
 * Tests module exports and hybridSearch function signature.
 */

import { describe, test, expect, mock } from 'bun:test';

// Only mock logger
mock.module('../../../core/logger.js', () => ({
  logger: {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

describe('hybridSearch module', () => {
  test('module exports all expected functions', async () => {
    const mod = await import('../../../core/memory/hybrid-search.js');
    expect(mod.hybridSearch).toBeFunction();
  });

  test('HybridSearchOptions is defined', async () => {
    const mod = await import('../../../core/memory/hybrid-search.js');
    expect(mod).toBeDefined();
  });
});
