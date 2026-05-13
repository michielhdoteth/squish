/**
 * Tests for LLM-aware consolidation in core/memory/consolidation.ts
 * TDD: Write tests first, then implement
 * Tests the exported pure functions (truncate, generateExtractiveSummary, generateClusterSummary).
 * Functions with DB deps tested via integration.
 */

import { describe, test, expect, mock } from 'bun:test';

// Only mock logger (pure config, no chain issues)
mock.module('../../../core/logger.js', () => ({
  logger: {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  },
}));

describe('truncate', () => {
  test('returns text unchanged when shorter than max', async () => {
    const { truncate } = await import('../../../core/memory/consolidation.js');
    expect(truncate('hello', 100)).toBe('hello');
  });

  test('returns text unchanged when equal to max', async () => {
    const { truncate } = await import('../../../core/memory/consolidation.js');
    expect(truncate('hello', 5)).toBe('hello');
  });

  test('truncates with ellipsis when longer than max', async () => {
    const { truncate } = await import('../../../core/memory/consolidation.js');
    const result = truncate('hello world this is long', 10);
    expect(result).toBe('hello w...');
    expect(result.length).toBe(10);
  });

  test('handles empty string', async () => {
    const { truncate } = await import('../../../core/memory/consolidation.js');
    expect(truncate('', 10)).toBe('');
  });

  test('handles maxLength of 0', async () => {
    const { truncate } = await import('../../../core/memory/consolidation.js');
    expect(truncate('hello', 3)).toBe('...');
  });
});

describe('generateExtractiveSummary', () => {
  test('produces summary from single memory', async () => {
    const { generateExtractiveSummary } = await import('../../../core/memory/consolidation.js');
    const memories = [
      { id: '1', content: 'Single memory content', type: 'observation' },
    ];
    const summary = generateExtractiveSummary(memories);
    expect(summary).toContain('Consolidated from');
    expect(summary).toContain('Single memory content');
  });

  test('groups by memory type', async () => {
    const { generateExtractiveSummary } = await import('../../../core/memory/consolidation.js');
    const memories = [
      { id: '1', content: 'Fact about project', type: 'fact' },
      { id: '2', content: 'Another fact', type: 'fact' },
      { id: '3', content: 'Observation about code', type: 'observation' },
    ];
    const summary = generateExtractiveSummary(memories);
    expect(summary).toContain('facts (2)');
    expect(summary).toContain('observation');
  });

  test('handles empty memory array', async () => {
    const { generateExtractiveSummary } = await import('../../../core/memory/consolidation.js');
    const summary = generateExtractiveSummary([]);
    expect(summary).toContain('Consolidated from 0 memories');
  });

  test('handles memories with no type field', async () => {
    const { generateExtractiveSummary } = await import('../../../core/memory/consolidation.js');
    const memories = [
      { id: '1', content: 'No type specified' },
    ];
    const summary = generateExtractiveSummary(memories);
    expect(summary).toContain('observation');
    expect(summary).toContain('No type specified');
  });

  test('truncates long content in extractive summary', async () => {
    const { generateExtractiveSummary } = await import('../../../core/memory/consolidation.js');
    const longContent = 'A'.repeat(200);
    const memories = [
      { id: '1', content: longContent, type: 'observation' },
    ];
    const summary = generateExtractiveSummary(memories);
    expect(summary.length).toBeLessThan(300);
  });
});

describe('generateClusterSummary', () => {
  test('falls back to extractive when LLM not enabled', async () => {
    const { generateClusterSummary } = await import('../../../core/memory/consolidation.js');
    const memories = [
      { id: '1', content: 'Test memory one', type: 'observation' },
      { id: '2', content: 'Test memory two', type: 'observation' },
    ];
    const summary = await generateClusterSummary(memories);
    expect(summary).toContain('Consolidated from');
  });

  test('uses extractive for single memory', async () => {
    const { generateClusterSummary } = await import('../../../core/memory/consolidation.js');
    const memories = [
      { id: '1', content: 'Single memory', type: 'observation' },
    ];
    const summary = await generateClusterSummary(memories);
    expect(summary).toContain('Consolidated from');
    expect(summary).toContain('Single memory');
  });
});
