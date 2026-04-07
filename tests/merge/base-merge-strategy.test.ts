/**
 * Unit tests for BaseMergeStrategy class
 * Tests the common helper methods extracted from merge strategies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseMergeStrategy } from '../../algorithms/strategies/merge-strategies.js';
import type { Memory } from '../../drizzle/schema.js';

// Concrete implementation for testing
class TestMergeStrategy extends BaseMergeStrategy {
  type: 'test' = 'test';

  merge(sources: Memory[]): import('../../algorithms/strategies/merge-strategies.js').MergedMemory {
    // Simple test implementation
    return {
      content: 'test',
      summary: null,
      tags: [],
      metadata: {},
      mergeReason: 'test',
      conflictWarnings: [],
    };
  }
}

describe('BaseMergeStrategy', () => {
  let strategy: TestMergeStrategy;

  beforeEach(() => {
    strategy = new TestMergeStrategy();
  });

  describe('canMerge', () => {
    it('should reject merging with less than 2 sources', () => {
      const result = strategy.canMerge([]);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Need at least 2 memories to merge');
    });

    it('should reject merging with single source', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test content',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.canMerge(memories);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Need at least 2 memories to merge');
    });

    it('should allow merging with 2 or more sources', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Test 2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.canMerge(memories);
      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('handleEmptySources', () => {
    it('should return empty MergedMemory structure', () => {
      const result = strategy.handleEmptySources();

      expect(result).toEqual({
        content: '',
        summary: null,
        tags: [],
        metadata: {},
        mergeReason: 'Empty source set',
        conflictWarnings: [],
      });
    });
  });

  describe('mergeTags', () => {
    it('should merge tags from all sources into unique set', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          tags: ['tag1', 'tag2', 'tag1'], // duplicate tag
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Test 2',
          tags: ['tag2', 'tag3'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          metadata: {},
        },
      ];

      const result = strategy.mergeTags(memories);

      expect(result).toContain('tag1');
      expect(result).toContain('tag2');
      expect(result).toContain('tag3');
      expect(result.length).toBe(3); // No duplicates
    });

    it('should handle sources with no tags', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          tags: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Test 2',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          metadata: {},
        },
      ];

      const result = strategy.mergeTags(memories);
      expect(result).toEqual([]);
    });
  });

  describe('buildBaseMetadata', () => {
    it('should build metadata with mergedFrom and mergeCount', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Test 2',
          createdAt: new Date('2024-01-02').toISOString(),
          updatedAt: new Date('2024-01-02').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.buildBaseMetadata(memories);

      expect(result.mergedFrom).toEqual(['mem-1', 'mem-2']);
      expect(result.mergeCount).toBe(2);
    });

    it('should include extra fields when provided', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const extra = { customField: 'customValue', count: 42 };
      const result = strategy.buildBaseMetadata(memories, extra);

      expect(result.mergedFrom).toEqual(['mem-1']);
      expect(result.mergeCount).toBe(1);
      expect(result.customField).toBe('customValue');
      expect(result.count).toBe(42);
    });

    it('should not mutate extra object', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const extra = { customField: 'value' };
      const result = strategy.buildBaseMetadata(memories, extra);

      expect(result).not.toBe(extra);
      expect(result.customField).toBe('value');
    });
  });

  describe('sortByDate', () => {
    it('should sort sources by date descending (newest first)', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Oldest',
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Newest',
          createdAt: new Date('2024-01-03').toISOString(),
          updatedAt: new Date('2024-01-03').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-3',
          type: 'test',
          content: 'Middle',
          createdAt: new Date('2024-01-02').toISOString(),
          updatedAt: new Date('2024-01-02').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.sortByDate(memories);

      expect(result[0].content).toBe('Newest');
      expect(result[1].content).toBe('Middle');
      expect(result[2].content).toBe('Oldest');
    });

    it('should not mutate original array', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const originalOrder = memories.map(m => m.id);
      strategy.sortByDate(memories);

      expect(memories.map(m => m.id)).toEqual(originalOrder);
    });

    it('should sort ascending when order is asc', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Oldest',
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Newest',
          createdAt: new Date('2024-01-03').toISOString(),
          updatedAt: new Date('2024-01-03').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.sortByDate(memories, 'asc');

      expect(result[0].content).toBe('Oldest');
      expect(result[1].content).toBe('Newest');
    });
  });

  describe('sortChronologically', () => {
    it('should sort sources by date ascending (oldest first)', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Oldest',
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Newest',
          createdAt: new Date('2024-01-03').toISOString(),
          updatedAt: new Date('2024-01-03').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-3',
          type: 'test',
          content: 'Middle',
          createdAt: new Date('2024-01-02').toISOString(),
          updatedAt: new Date('2024-01-02').toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      const result = strategy.sortChronologically(memories);

      expect(result[0].content).toBe('Oldest');
      expect(result[1].content).toBe('Middle');
      expect(result[2].content).toBe('Newest');
    });
  });

  describe('validateSources', () => {
    it('should return false for empty array', () => {
      expect(strategy.validateSources([])).toBe(false);
    });

    it('should return false for single source', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      expect(strategy.validateSources(memories)).toBe(false);
    });

    it('should return true for 2 or more sources', () => {
      const memories: Memory[] = [
        {
          id: 'mem-1',
          type: 'test',
          content: 'Test 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
        {
          id: 'mem-2',
          type: 'test',
          content: 'Test 2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMergeable: true,
          isMerged: false,
          isActive: true,
          userId: 'user-1',
          source: 'test',
          confidence: 100,
          tags: [],
          metadata: {},
        },
      ];

      expect(strategy.validateSources(memories)).toBe(true);
    });
  });
});
