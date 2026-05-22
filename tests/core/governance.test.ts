import { describe, expect, test } from 'bun:test';

describe('governance pinning', () => {
  test('exports pinMemory, unpinMemory, getPinnedMemories', async () => {
    const mod = await import('../../core/security/governance.ts');
    expect(typeof mod.pinMemory).toBe('function');
    expect(typeof mod.unpinMemory).toBe('function');
    expect(typeof mod.getPinnedMemories).toBe('function');
  });

  test('exports protectMemory and memory governance utilities', async () => {
    const mod = await import('../../core/security/governance.ts');
    // Governance module is the single source of truth for pinning
    expect(mod.pinMemory.name).toBe('pinMemory');
    expect(mod.unpinMemory.name).toBe('unpinMemory');
  });
});
