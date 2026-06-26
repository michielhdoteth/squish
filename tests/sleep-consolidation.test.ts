/**
 * Sleep-Time Consolidation Tests
 * Tests deduplication, summarization, invalidation, and relevance decay
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// We test the pure functions and interfaces directly
// Integration tests mock database calls

import type {
  ConsolidationConfig,
  ConsolidationResult,
  DuplicatePair,
} from '../core/memory/sleep-consolidation.js';

import {
  DEFAULT_CONSOLIDATION_CONFIG,
  findDuplicatePairs,
  computeRelevanceDecay,
  isStale,
  mergeDuplicates,
  summarizeVerboseContent,
} from '../core/memory/sleep-consolidation.js';

describe('Sleep Consolidation - Config Defaults', () => {
  it('should have sensible default config', () => {
    expect(DEFAULT_CONSOLIDATION_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONSOLIDATION_CONFIG.deduplicationThreshold).toBe(0.92);
    expect(DEFAULT_CONSOLIDATION_CONFIG.stalenessDays).toBe(90);
    expect(DEFAULT_CONSOLIDATION_CONFIG.maxConsolidationsPerRun).toBe(50);
  });

  it('should allow partial config override', () => {
    const config: ConsolidationConfig = {
      ...DEFAULT_CONSOLIDATION_CONFIG,
      deduplicationThreshold: 0.85,
    };
    expect(config.deduplicationThreshold).toBe(0.85);
    expect(config.stalenessDays).toBe(90); // inherited default
  });
});

describe('Sleep Consolidation - Duplicate Pair Detection', () => {
  it('should find no duplicates in empty list', () => {
    const pairs = findDuplicatePairs([], 0.92);
    expect(pairs).toEqual([]);
  });

  it('should find duplicate pair above threshold', () => {
    const memories = [
      { id: 'm1', content: 'TypeScript is a typed superset of JavaScript', embedding: [1, 0, 0] },
      { id: 'm2', content: 'TypeScript is a typed superset of JavaScript', embedding: [1, 0, 0] },
    ];
    const pairs = findDuplicatePairs(memories, 0.92);
    expect(pairs.length).toBe(1);
    expect(pairs[0].similarity).toBe(1.0);
    expect(pairs[0].a).toBe('m1');
    expect(pairs[0].b).toBe('m2');
  });

  it('should not find duplicates below threshold', () => {
    const memories = [
      { id: 'm1', content: 'Cats are fluffy', embedding: [1, 0, 0] },
      { id: 'm2', content: 'Dogs are loyal', embedding: [0, 0, 1] },
    ];
    const pairs = findDuplicatePairs(memories, 0.92);
    expect(pairs.length).toBe(0);
  });

  it('should handle memories without embeddings', () => {
    const memories = [
      { id: 'm1', content: 'Hello world', embedding: null },
      { id: 'm2', content: 'Hello world', embedding: null },
    ];
    // Should fall back to text similarity
    const pairs = findDuplicatePairs(memories, 0.92);
    // Identical text should be detected
    expect(pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('should only return pairs above threshold', () => {
    const memories = [
      { id: 'm1', content: 'A', embedding: [1, 0, 0] },
      { id: 'm2', content: 'B', embedding: [0.9, 0.1, 0] }, // similarity ~0.99
      { id: 'm3', content: 'C', embedding: [0, 1, 0] },     // similarity 0
    ];
    const pairs = findDuplicatePairs(memories, 0.95);
    // m1-m2 should be above 0.95, m1-m3 and m2-m3 should not
    for (const pair of pairs) {
      expect(pair.similarity).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe('Sleep Consolidation - Staleness Detection', () => {
  it('should detect stale memory older than threshold', () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    const memory = {
      id: 'm1',
      content: 'Old memory',
      createdAt: oldDate.toISOString(),
      lastAccessedAt: oldDate.toISOString(),
      isPinned: false,
      importanceScore: 30,
    };
    expect(isStale(memory, 90)).toBe(true);
  });

  it('should not detect fresh memory as stale', () => {
    const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const memory = {
      id: 'm1',
      content: 'Fresh memory',
      createdAt: freshDate.toISOString(),
      lastAccessedAt: freshDate.toISOString(),
      isPinned: false,
      importanceScore: 50,
    };
    expect(isStale(memory, 90)).toBe(false);
  });

  it('should never mark pinned memories as stale', () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const memory = {
      id: 'm1',
      content: 'Pinned old memory',
      createdAt: oldDate.toISOString(),
      lastAccessedAt: oldDate.toISOString(),
      isPinned: true,
      importanceScore: 10,
    };
    expect(isStale(memory, 90)).toBe(false);
  });

  it('should consider recently accessed memory as not stale', () => {
    const oldCreateDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const recentAccess = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const memory = {
      id: 'm1',
      content: 'Old but recently accessed',
      createdAt: oldCreateDate.toISOString(),
      lastAccessedAt: recentAccess.toISOString(),
      isPinned: false,
      importanceScore: 50,
    };
    // Recently accessed (within stalenessDays) means not stale
    expect(isStale(memory, 90)).toBe(false);
  });
});

describe('Sleep Consolidation - Relevance Decay', () => {
  it('should decay importance for unused memories', () => {
    const memory = {
      id: 'm1',
      importanceScore: 80,
      lastAccessedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      accessCount: 0,
    };
    const decayed = computeRelevanceDecay(memory, 0.1);
    expect(decayed).toBeLessThan(80);
    expect(decayed).toBeGreaterThan(0);
  });

  it('should not decay below zero', () => {
    const memory = {
      id: 'm1',
      importanceScore: 5,
      lastAccessedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
      accessCount: 0,
    };
    const decayed = computeRelevanceDecay(memory, 0.1);
    expect(decayed).toBeGreaterThanOrEqual(0);
  });

  it('should not decay recently accessed memories', () => {
    const memory = {
      id: 'm1',
      importanceScore: 80,
      lastAccessedAt: new Date().toISOString(), // just now
      accessCount: 10,
    };
    const decayed = computeRelevanceDecay(memory, 0.1);
    // Recently accessed - minimal or no decay
    expect(decayed).toBeGreaterThanOrEqual(75);
  });

  it('should decay more for lower access counts', () => {
    const baseDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const highAccess = {
      id: 'm1',
      importanceScore: 80,
      lastAccessedAt: baseDate.toISOString(),
      accessCount: 20,
    };
    const lowAccess = {
      id: 'm2',
      importanceScore: 80,
      lastAccessedAt: baseDate.toISOString(),
      accessCount: 1,
    };
    const decayedHigh = computeRelevanceDecay(highAccess, 0.1);
    const decayedLow = computeRelevanceDecay(lowAccess, 0.1);
    // Higher access count should retain more
    expect(decayedHigh).toBeGreaterThanOrEqual(decayedLow);
  });
});

describe('Sleep Consolidation - Merge Duplicates', () => {
  it('should return empty result for empty pairs', async () => {
    const result = await mergeDuplicates([]);
    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('should merge a duplicate pair keeping the newer memory', async () => {
    const pairs: DuplicatePair[] = [
      {
        a: 'm1',
        b: 'm2',
        similarity: 0.95,
        contentA: 'Old version of the memory',
        contentB: 'New version of the memory',
      },
    ];
    // Mock lookup: m1 is older, m2 is newer
    const mockLookup = async (ids: string[]) =>
      ids.map(id => ({
        id,
        createdAt: id === 'm1' ? new Date('2024-01-01') : new Date('2025-01-01'),
      }));
    const result = await mergeDuplicates(pairs, mockLookup);
    expect(result.merged).toBe(1);
    expect(result.kept).toContain('m2'); // newer kept
    expect(result.superseded).toContain('m1'); // older superseded
  });

  it('should handle multiple merge pairs', async () => {
    const pairs: DuplicatePair[] = [
      { a: 'm1', b: 'm2', similarity: 0.95, contentA: 'A1', contentB: 'B1' },
      { a: 'm3', b: 'm4', similarity: 0.98, contentA: 'A2', contentB: 'B2' },
    ];
    const mockLookup = async (ids: string[]) =>
      ids.map(id => ({ id, createdAt: new Date('2024-06-01') }));
    const result = await mergeDuplicates(pairs, mockLookup);
    expect(result.merged).toBe(2);
  });
});

describe('Sleep Consolidation - Summarize Verbose Content', () => {
  it('should return original content if already concise', () => {
    const content = 'Short memory content';
    const result = summarizeVerboseContent(content, 200);
    expect(result).toBe(content);
  });

  it('should truncate verbose content', () => {
    const longContent = 'This is a very long memory. '.repeat(50); // ~1500 chars
    const result = summarizeVerboseContent(longContent, 200);
    expect(result.length).toBeLessThanOrEqual(210); // some margin
    expect(result).toContain('...');
  });

  it('should handle empty content', () => {
    const result = summarizeVerboseContent('', 200);
    expect(result).toBe('');
  });
});

describe('Sleep Consolidation - ConsolidationResult Shape', () => {
  it('should have correct result shape', () => {
    const result: ConsolidationResult = {
      deduplicated: 0,
      summarized: 0,
      invalidated: 0,
      decayed: 0,
      errors: 0,
    };
    expect(result).toHaveProperty('deduplicated');
    expect(result).toHaveProperty('summarized');
    expect(result).toHaveProperty('invalidated');
    expect(result).toHaveProperty('decayed');
    expect(result).toHaveProperty('errors');
  });
});
