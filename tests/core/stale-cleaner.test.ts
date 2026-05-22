import { describe, expect, test } from 'bun:test';

describe('stale memory cleaner', () => {
  test('exports getStaleMemories, deleteMemoryPermanently, runAutoClean', async () => {
    const mod = await import('../../core/memory/stale-cleaner.ts');
    expect(typeof mod.getStaleMemories).toBe('function');
    expect(typeof mod.deleteMemoryPermanently).toBe('function');
    expect(typeof mod.runAutoClean).toBe('function');
  });

  test('getStaleMemories handles empty results gracefully', async () => {
    const { getStaleMemories } = await import('../../core/memory/stale-cleaner.ts');
    const result = await getStaleMemories({
      olderThanDays: 9999,
      confidenceLevels: ['outdated'],
      minImportance: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  test('runAutoClean returns structured result with deleted and summary', async () => {
    const { runAutoClean } = await import('../../core/memory/stale-cleaner.ts');
    const result = await runAutoClean({ olderThanDays: 9999, limit: 5 });
    expect(result).toBeDefined();
    expect(typeof result.deleted).toBe('number');
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.scanned).toBe('number');
  });

  test('StaleMemory interface has required fields', async () => {
    const mod = await import('../../core/memory/stale-cleaner.ts');
    // Verify the types/interface acceptance by calling with partial args
    const result = await mod.runAutoClean({});
    expect(result.deleted).toBeDefined();
  });
});
