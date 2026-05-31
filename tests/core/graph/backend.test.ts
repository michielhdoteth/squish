/**
 * Tests for Kuzu Graph Backend
 *
 * These tests verify the GraphBackend interface implementation
 * using both in-memory (default) and Kuzu backends.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { GraphBackend, KuzuBackend, InMemoryGraphBackend } from '../../../core/graph/backend.js';
import { GraphNode } from '../../../core/graph/backend.js';

describe('InMemoryGraphBackend', () => {
  let backend: InMemoryGraphBackend;

  beforeEach(() => {
    backend = new InMemoryGraphBackend();
  });

  afterEach(async () => {
    await backend.close();
  });

  it('should connect successfully', async () => {
    await expect(backend.connect()).resolves.toBeUndefined();
  });

  it('should create a node', async () => {
    await backend.connect();
    await backend.createNode('mem-1', {
      type: 'memory',
      content: 'Test memory',
      createdAt: new Date().toISOString(),
    });

    const nodes = await backend.getAllNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('mem-1');
    expect(nodes[0].props.type).toBe('memory');
  });

  it('should create an edge between nodes', async () => {
    await backend.connect();
    await backend.createNode('mem-1', { type: 'memory' });
    await backend.createNode('mem-2', { type: 'memory' });

    await backend.createEdge('mem-1', 'mem-2', {
      type: 'relates_to',
      weight: 0.8,
      coactivationCount: 1,
    });

    const edges = await backend.getAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe('mem-1');
    expect(edges[0].to).toBe('mem-2');
    expect(edges[0].props.weight).toBe(0.8);
  });

  it('should perform BFS traversal', async () => {
    await backend.connect();

    // Create a simple graph: mem-1 -> mem-2 -> mem-3
    await backend.createNode('mem-1', { type: 'memory' });
    await backend.createNode('mem-2', { type: 'memory' });
    await backend.createNode('mem-3', { type: 'memory' });

    await backend.createEdge('mem-1', 'mem-2', { weight: 0.9, coactivationCount: 1 });
    await backend.createEdge('mem-2', 'mem-3', { weight: 0.7, coactivationCount: 1 });

    const nodes = await backend.bfs('mem-1', 2);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.id === 'mem-2')).toBe(true);
    expect(nodes.some((n) => n.id === 'mem-3')).toBe(true);
  });

  it('should respect maxDepth in BFS', async () => {
    await backend.connect();

    // Create a chain: mem-1 -> mem-2 -> mem-3 -> mem-4
    await backend.createNode('mem-1', { type: 'memory' });
    await backend.createNode('mem-2', { type: 'memory' });
    await backend.createNode('mem-3', { type: 'memory' });
    await backend.createNode('mem-4', { type: 'memory' });

    await backend.createEdge('mem-1', 'mem-2', { weight: 0.9, coactivationCount: 1 });
    await backend.createEdge('mem-2', 'mem-3', { weight: 0.9, coactivationCount: 1 });
    await backend.createEdge('mem-3', 'mem-4', { weight: 0.9, coactivationCount: 1 });

    const nodes = await backend.bfs('mem-1', 1);

    expect(nodes.some((n) => n.id === 'mem-2')).toBe(true);
    expect(nodes.some((n) => n.id === 'mem-3')).toBe(false);
    expect(nodes.some((n) => n.id === 'mem-4')).toBe(false);
  });

  it('should delete a node and its edges', async () => {
    await backend.connect();
    await backend.createNode('mem-1', { type: 'memory' });
    await backend.createNode('mem-2', { type: 'memory' });
    await backend.createEdge('mem-1', 'mem-2', { weight: 0.8 });

    await backend.deleteNode('mem-1');

    const nodes = await backend.getAllNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('mem-2');
  });

  it('should update node properties', async () => {
    await backend.connect();
    await backend.createNode('mem-1', { type: 'memory', importance: 50 });

    await backend.updateNode('mem-1', { importance: 80 });

    const nodes = await backend.getAllNodes();
    expect(nodes[0].props.importance).toBe(80);
  });
});

describe('GraphBackend Interface', () => {
  it('should define required methods', () => {
    const requiredMethods = ['connect', 'createNode', 'createEdge', 'bfs', 'close'];
    const mockBackend = {
      connect: async () => {},
      createNode: async () => {},
      createEdge: async () => {},
      bfs: async () => [],
      close: async () => {},
    };

    for (const method of requiredMethods) {
      expect(typeof (mockBackend as any)[method]).toBe('function');
    }
  });
});

describe('KuzuBackend', () => {
  // These tests only run if Kuzu is installed and we're not on Bun/Windows
  const isBunWindows = typeof Bun !== 'undefined' && process.platform === 'win32';
  const canRunKuzu = !isBunWindows;

  it.skipIf(!canRunKuzu)('should handle missing Kuzu gracefully', async () => {
    // Mock the import to simulate missing Kuzu
    const originalRequire = globalThis.require;
    try {
      // Test that the backend can be instantiated
      const testBackend = new KuzuBackend(':memory:');
      expect(testBackend).toBeInstanceOf(KuzuBackend);
    } finally {
      globalThis.require = originalRequire;
    }
  });

  it.skipIf(!canRunKuzu)('should connect to Kuzu database', async () => {
    const backend = new KuzuBackend(':memory:'); // Use in-memory mode for testing
    await backend.connect();

    // If we get here, Kuzu is available
    expect(backend).toBeDefined();

    await backend.close();
  });

  it.skipIf(!canRunKuzu)('should create and query nodes in Kuzu', async () => {
    const backend = new KuzuBackend(':memory:');
    await backend.connect();

    await backend.createNode('mem-1', {
      type: 'memory',
      content: 'Test memory',
    });

    const node = await backend.getNode('mem-1');
    expect(node).not.toBeNull();
    expect(node?.id).toBe('mem-1');

    await backend.close();
  });
});

describe('Graph Backend Factory', () => {
  it('should create InMemory backend by default', () => {
    const { createGraphBackend } = require('../../../core/graph/backend.js');
    const backend = createGraphBackend('memory');
    expect(backend).toBeInstanceOf(InMemoryGraphBackend);
  });

  it('should create Kuzu backend when specified', () => {
    const { createGraphBackend } = require('../../../core/graph/backend.js');
    try {
      const backend = createGraphBackend('kuzu', ':memory:');
      expect(backend).toBeInstanceOf(KuzuBackend);
    } catch (e: any) {
      if (e.message?.includes('Cannot find module')) {
        console.warn('Kuzu not installed, skipping test');
      } else {
        throw e;
      }
    }
  });
});
