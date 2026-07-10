/**
 * Tests for storage/index.ts barrel exports
 *
 * Verifies that storage/index.ts re-exports all expected symbols correctly.
 */

import { describe, it, expect } from 'bun:test';

describe('storage/index.ts barrel exports', () => {
  it('exports storeMemory', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.storeMemory).toBe('function');
  });

  it('exports getMemoryById', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getMemoryById).toBe('function');
  });

  it('exports queryMemories', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.queryMemories).toBe('function');
  });

  it('exports routeQuery', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.routeQuery).toBe('function');
  });

  it('exports extractEntities', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.extractEntities).toBe('function');
  });

  it('exports boostByEntities', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.boostByEntities).toBe('function');
  });

  it('exports enrichWith', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.enrichWith).toBe('function');
  });

  it('exports recall', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.recall).toBe('function');
  });

  it('exports createStorageFacade', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.createStorageFacade).toBe('function');
  });

  it('exports getEntities', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getEntities).toBe('function');
  });

  it('exports getEntity', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getEntity).toBe('function');
  });

  it('exports getEntityRelationsByName', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getEntityRelationsByName).toBe('function');
  });

  it('exports getProjectEntityList', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getProjectEntityList).toBe('function');
  });

  it('exports getEntityNeighborhood', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getEntityNeighborhood).toBe('function');
  });

  it('exports traverseGraph', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.traverseGraph).toBe('function');
  });

  it('exports findEntityPaths', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.findEntityPaths).toBe('function');
  });

  it('exports getStrategyByKeywords', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.getStrategyByKeywords).toBe('function');
  });
});
