import { describe, expect, test } from 'bun:test';

describe('memory tier classification', () => {
  test('exports classifyMemoryTier, recalculateTiers, promoteToSturdy, getTierStats', async () => {
    const mod = await import('../../core/memory/tiers.ts');
    expect(typeof mod.classifyMemoryTier).toBe('function');
    expect(typeof mod.recalculateTiers).toBe('function');
    expect(typeof mod.promoteToSturdy).toBe('function');
    expect(typeof mod.getTierStats).toBe('function');
  });

  test('classifyMemoryTier returns sturdy for pinned memories', async () => {
    const { classifyMemoryTier } = await import('../../core/memory/tiers.ts');
    expect(classifyMemoryTier({ isPinned: true })).toBe('sturdy');
  });

  test('classifyMemoryTier returns sturdy for frequently accessed memories', async () => {
    const { classifyMemoryTier } = await import('../../core/memory/tiers.ts');
    const result = classifyMemoryTier({
      accessCount: 6,
      lastAccessedAt: new Date(Date.now() - 1 * 86400000).toISOString()
    });
    expect(result).toBe('sturdy');
  });

  test('classifyMemoryTier returns fleeting for low importance old memories', async () => {
    const { classifyMemoryTier } = await import('../../core/memory/tiers.ts');
    const result = classifyMemoryTier({
      importanceScore: 20,
      createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
      accessCount: 0,
    });
    expect(result).toBe('fleeting');
  });

  test('classifyMemoryTier returns working as default', async () => {
    const { classifyMemoryTier } = await import('../../core/memory/tiers.ts');
    const result = classifyMemoryTier({
      importanceScore: 50,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
    });
    expect(result).toBe('working');
  });

  test('classifyMemoryTier returns long-term for old important accessed memories', async () => {
    const { classifyMemoryTier } = await import('../../core/memory/tiers.ts');
    const result = classifyMemoryTier({
      importanceScore: 70,
      createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
      lastAccessedAt: new Date(Date.now() - 10 * 86400000).toISOString()
    });
    expect(result).toBe('long-term');
  });

  test('promoteToSturdy and getTierStats export correctly', async () => {
    const { promoteToSturdy, getTierStats } = await import('../../core/memory/tiers.ts');
    expect(typeof promoteToSturdy).toBe('function');
    expect(typeof getTierStats).toBe('function');
  });
});
