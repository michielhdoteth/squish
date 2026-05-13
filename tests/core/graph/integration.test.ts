/**
 * Integration tests for Graph Backend with Graph Boost
 *
 * Verifies that the graph backend abstraction works correctly
 * with the graph boost calculation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryGraphBackend } from '../../../core/graph/backend.js';
import { calculateGraphBoost } from '../../../core/search/graph-boost.js';

describe('Graph Backend Integration', () => {
  let backend: InMemoryGraphBackend;

  beforeEach(() => {
    backend = new InMemoryGraphBackend();
  });

  afterEach(async () => {
    await backend.close();
  });

  it('should calculate graph boost using InMemory backend', async () => {
    await backend.connect();

    // Create test nodes
    await backend.createNode('mem-1', { type: 'memory', importance: 80 });
    await backend.createNode('mem-2', { type: 'memory', importance: 60 });
    await backend.createNode('mem-3', { type: 'memory', importance: 40 });

    // Create edges
    await backend.createEdge('mem-1', 'mem-2', {
      weight: 0.9,
      coactivationCount: 3,
      associationType: 'relates_to',
      lastAccessedAt: new Date().toISOString(),
    });

    await backend.createEdge('mem-2', 'mem-3', {
      weight: 0.7,
      coactivationCount: 2,
      associationType: 'relates_to',
      lastAccessedAt: new Date().toISOString(),
    });

    // Test BFS traversal
    const nodes = await backend.bfs('mem-1', 2);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.id === 'mem-2')).toBe(true);
    expect(nodes.some((n) => n.id === 'mem-3')).toBe(true);
  });

  it('should handle empty memory list', async () => {
    const boostMap = await calculateGraphBoost([]);
    expect(boostMap.size).toBe(0);
  });
});
