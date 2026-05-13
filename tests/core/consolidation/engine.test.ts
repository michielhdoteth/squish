/**
 * Consolidation Engine Tests
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock dependencies before importing the module under test
// We need to mock at the module level

// Mock getDbClient
const mockDbClient = {
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => []
        })
      })
    }),
    insert: () => ({
      values: () => Promise.resolve()
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve()
      })
    })
  },
  schema: {
    memories: { id: 'memories' }
  },
  raw: {
    query: () => Promise.resolve({ rows: [] }),
    prepare: () => ({ all: () => [] })
  }
};

// We'll test the pure functions directly by importing them
// For integration tests, we'll mock the dependencies

// Import the module under test
// Path: from tests/core/consolidation/engine.test.ts to core/consolidation/engine.ts
// tests/core/consolidation/engine.test.ts -> ../../../ -> root, then core/consolidation/engine.ts
import {
  runSleepCycle,
  ConsolidationConfig,
  dbscanCluster,
  extractPattern,
  calculateOverlap,
  findNeighbors,
  DEFAULT_CONFIG
} from '../../../core/consolidation/engine.ts';

describe('Consolidation Engine - DBSCAN Clustering', () => {
  it('should return empty clusters for empty input', () => {
    const clusters = dbscanCluster([], 0.8, 3);
    expect(clusters).toEqual([]);
  });

  it('should return empty clusters when all memories are noise (below minPts)', () => {
    const memories = [
      { id: '1', tags: ['tag1'], content: 'memory one' },
      { id: '2', tags: ['tag2'], content: 'memory two' },
      { id: '3', tags: ['tag3'], content: 'memory three' }
    ];

    const clusters = dbscanCluster(memories, 0.8, 3);
    // With no overlapping tags, all are noise
    expect(clusters.length).toBe(0);
  });

  it('should cluster memories with shared tags', () => {
    const memories = [
      { id: '1', tags: ['shared', 'unique1'], content: 'memory one' },
      { id: '2', tags: ['shared', 'unique2'], content: 'memory two' },
      { id: '3', tags: ['shared', 'unique3'], content: 'memory three' },
      { id: '4', tags: ['different'], content: 'memory four' }
    ];

    const clusters = dbscanCluster(memories, 0.3, 2);
    // First 3 should cluster together (shared tag), 4th is noise
    expect(clusters.length).toBeGreaterThan(0);
    if (clusters.length > 0) {
      expect(clusters[0].length).toBe(3);
    }
  });

  it('should respect maxClusterSize', () => {
    const memories = Array.from({ length: 25 }, (_, i) => ({
      id: `mem-${i}`,
      tags: ['shared'],
      content: `memory ${i}`
    }));

    const clusters = dbscanCluster(memories, 0.3, 2);
    if (clusters.length > 0) {
      // Should be capped at 20 (default maxClusterSize in implementation)
      expect(clusters[0].length).toBeLessThanOrEqual(20);
    }
  });

  it('should use custom minPts parameter', () => {
    const memories = [
      { id: '1', tags: ['a'], content: 'one' },
      { id: '2', tags: ['a'], content: 'two' },
      { id: '3', tags: ['a'], content: 'three' }
    ];

    // With minPts=2, should cluster
    const clusters1 = dbscanCluster(memories, 0.3, 2);
    expect(clusters1.length).toBeGreaterThan(0);

    // With minPts=4, should not cluster (only 3 items)
    const clusters2 = dbscanCluster(memories, 0.3, 4);
    expect(clusters2.length).toBe(0);
  });
});

describe('Consolidation Engine - Pattern Extraction', () => {
  it('should extract pattern from cluster', () => {
    const cluster = [
      { id: '1', tags: ['typescript', 'testing', 'tdd'], content: 'Write tests first' },
      { id: '2', tags: ['typescript', 'testing'], content: 'Run test suite' },
      { id: '3', tags: ['typescript', 'tdd'], content: 'Red green refactor' }
    ];

    const pattern = extractPattern(cluster);
    expect(pattern).toBeDefined();
    expect(pattern.summary).toContain('typescript');
    expect(pattern.keyPoints.length).toBeGreaterThan(0);
    expect(pattern.confidence).toBeGreaterThanOrEqual(0);
    expect(pattern.confidence).toBeLessThanOrEqual(1);
  });

  it('should return higher confidence for larger clusters', () => {
    const smallCluster = Array.from({ length: 3 }, (_, i) => ({
      id: `small-${i}`,
      tags: ['tag'],
      content: `content ${i}`
    }));

    const largeCluster = Array.from({ length: 10 }, (_, i) => ({
      id: `large-${i}`,
      tags: ['tag'],
      content: `content ${i}`
    }));

    const smallPattern = extractPattern(smallCluster);
    const largePattern = extractPattern(largeCluster);

    expect(largePattern.confidence).toBeGreaterThan(smallPattern.confidence);
  });

  it('should handle empty cluster', () => {
    const pattern = extractPattern([]);
    expect(pattern.summary).toBeDefined();
    expect(pattern.keyPoints).toEqual([]);
    expect(pattern.confidence).toBe(0);
  });

  it('should extract top tags correctly', () => {
    const cluster = [
      { id: '1', tags: ['common', 'rare1'], content: 'one' },
      { id: '2', tags: ['common', 'rare2'], content: 'two' },
      { id: '3', tags: ['common', 'rare3'], content: 'three' },
      { id: '4', tags: ['common', 'rare1'], content: 'four' }  // rare1 appears twice
    ];

    const pattern = extractPattern(cluster);
    expect(pattern.keyPoints).toContain('common'); // Most frequent
  });
});

describe('Consolidation Engine - Overlap Calculation', () => {
  it('should return 1.0 for identical content', () => {
    const overlap = calculateOverlap('hello world test', 'hello world test');
    expect(overlap).toBe(1.0);
  });

  it('should return 0.0 for completely different content', () => {
    const overlap = calculateOverlap('hello world', 'foo bar baz');
    expect(overlap).toBe(0.0);
  });

  it('should calculate partial overlap correctly', () => {
    const overlap = calculateOverlap('hello world test', 'hello universe test');
    // "hello" and "test" are shared = 2 words
    // Total unique words: hello, world, test, universe = 4
    // Overlap = 2/4 = 0.5
    expect(overlap).toBeCloseTo(0.5, 1);
  });

  it('should be case insensitive', () => {
    const overlap = calculateOverlap('Hello World', 'hello world');
    expect(overlap).toBe(1.0);
  });

  it('should handle empty strings', () => {
    const overlap = calculateOverlap('', '');
    // Both empty = identical, so overlap should be 1.0
    expect(overlap).toBe(1.0);
  });
});

describe('Consolidation Engine - Find Neighbors', () => {
  it('should find neighbors with shared tags', () => {
    const target = { id: '1', tags: ['shared', 'unique1'], content: 'target' };
    const memories = [
      target,
      { id: '2', tags: ['shared', 'unique2'], content: 'neighbor1' },
      { id: '3', tags: ['different'], content: 'not neighbor' }
    ];

    const neighbors = findNeighbors(target, memories, 0.3);
    expect(neighbors.length).toBe(1);
    expect(neighbors[0].id).toBe('2');
  });

  it('should not include the target itself', () => {
    const target = { id: '1', tags: ['tag'], content: 'target' };
    const memories = [target];

    const neighbors = findNeighbors(target, memories, 0.3);
    expect(neighbors.length).toBe(0);
  });

  it('should respect similarity threshold', () => {
    const target = { id: '1', tags: ['a', 'b'], content: 'target' };
    const memories = [
      target,
      // intersection: ['a'], union: ['a', 'b', 'c'] = 1/3 = 0.333
      { id: '2', tags: ['a', 'c'], content: 'neighbor1' },
      // intersection: ['a'], union: ['a', 'b', 'd', 'e'] = 1/4 = 0.25
      { id: '3', tags: ['a', 'd', 'e'], content: 'neighbor2' }
    ];

    // With threshold 0.4, neither neighbor qualifies (0.333 < 0.4 and 0.25 < 0.4)
    const neighbors = findNeighbors(target, memories, 0.4);
    expect(neighbors.length).toBe(0);
  });

  it('should find neighbors with similarity above threshold', () => {
    const target = { id: '1', tags: ['a', 'b'], content: 'target' };
    const memories = [
      target,
      // intersection: ['a'], union: ['a', 'b'] = 1/2 = 0.5
      { id: '2', tags: ['a'], content: 'neighbor1' },
      // intersection: ['a', 'b'], union: ['a', 'b', 'c'] = 2/3 = 0.666
      { id: '3', tags: ['a', 'b', 'c'], content: 'neighbor2' }
    ];

    // With threshold 0.4, both neighbors qualify
    const neighbors = findNeighbors(target, memories, 0.4);
    expect(neighbors.length).toBe(2);
  });
});

describe('Consolidation Engine - Sleep Cycle', () => {
  // Mock the dependencies
  const originalFetchEpisodic = globalThis.fetch;

  beforeEach(() => {
    // Reset mocks
  });

  afterEach(() => {
    // Restore
  });

  it('should return early when consolidation is disabled', async () => {
    const result = await runSleepCycle(undefined, { enabled: false });

    expect(result.clusters).toBe(0);
    expect(result.merged).toBe(0);
    expect(result.promoted).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('should use default config when no config provided', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.sleepIntervalHours).toBe(24);
    expect(DEFAULT_CONFIG.minClusterSize).toBe(3);
    expect(DEFAULT_CONFIG.maxClusterSize).toBe(20);
    expect(DEFAULT_CONFIG.similarityThreshold).toBe(0.8);
    expect(DEFAULT_CONFIG.mergeConfidence).toBe(0.85);
  });

  it('should merge config with defaults', () => {
    const customConfig = { sleepIntervalHours: 12, minClusterSize: 5 };
    const merged = { ...DEFAULT_CONFIG, ...customConfig };

    expect(merged.sleepIntervalHours).toBe(12);
    expect(merged.minClusterSize).toBe(5);
    expect(merged.enabled).toBe(true); // From default
    expect(merged.maxClusterSize).toBe(20); // From default
  });
});

describe('Consolidation Engine - Integration', () => {
  it('should handle fetch errors gracefully', async () => {
    // This test verifies error handling when DB calls fail
    // In real implementation, we'd mock getDbClient to throw
    const result = await runSleepCycle(undefined, { enabled: true });

    // Should return with errors array populated if something fails
    expect(result).toBeDefined();
    expect(result.errors).toBeDefined();
  });
});

describe('Consolidation Engine - Edge Cases', () => {
  it('should handle memories with null tags', () => {
    const memories = [
      { id: '1', tags: null, content: 'one' },
      { id: '2', tags: undefined, content: 'two' },
      { id: '3', tags: [], content: 'three' }
    ];

    const clusters = dbscanCluster(memories, 0.8, 2);
    // All have no tags, so no clustering should occur
    expect(clusters.length).toBe(0);
  });

  it('should handle single memory', () => {
    const memories = [
      { id: '1', tags: ['tag'], content: 'only memory' }
    ];

    const clusters = dbscanCluster(memories, 0.8, 2);
    // Single memory can't form cluster with minPts=2
    expect(clusters.length).toBe(0);
  });

  it('should handle pattern extraction with null tags', () => {
    const cluster = [
      { id: '1', tags: null, content: 'one' }
    ];

    const pattern = extractPattern(cluster);
    expect(pattern).toBeDefined();
    expect(pattern.keyPoints).toEqual([]);
  });
});
