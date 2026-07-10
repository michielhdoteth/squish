/**
 * Tests for bridge/index.ts barrel exports
 *
 * Verifies that bridge/index.ts re-exports all expected symbols correctly.
 */

import { describe, it, expect } from 'bun:test';

describe('bridge/index.ts barrel exports', () => {
  it('exports bridgeSessionToGraph', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.bridgeSessionToGraph).toBe('function');
  });

  it('exports getBridgeStats', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getBridgeStats).toBe('function');
  });

  it('module loads successfully', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });
});
