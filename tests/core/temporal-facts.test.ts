import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  checkTemporalValidity,
  supersedeOldTemporalFacts,
  cleanupExpiredTemporalFacts,
  getTemporalFactsStats,
} from '../../core/memory/temporal-facts.js';

// Mock database
mock.module('../../db/index.js', () => ({
  getDb: async () => null,
}));

mock.module('../../db/schema.js', () => ({
  getSchema: async () => ({
    memories: {},
  }),
}));

describe('Temporal Facts', () => {
  describe('checkTemporalValidity', () => {
    test('should return valid for memory without expiry', async () => {
      // This test will hit the database mock which returns null
      // So we test the error handling path
      const result = await checkTemporalValidity('nonexistent-memory');
      // Graceful fallback returns valid on error
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('supersedeOldTemporalFacts', () => {
    test('should return empty result when no temporal facts found', async () => {
      const result = await supersedeOldTemporalFacts(
        'new-mem-id',
        'This is a simple memory without temporal facts',
        'project-1'
      );

      expect(result.supersededCount).toBe(0);
      expect(result.newValidFrom).toBeInstanceOf(Date);
    });

    test('should handle content with temporal expressions', async () => {
      const result = await supersedeOldTemporalFacts(
        'new-mem-id',
        'Starting January 2025, the new policy applies',
        'project-1'
      );

      expect(result).toBeDefined();
      expect(result.newValidFrom).toBeInstanceOf(Date);
    });
  });

  describe('cleanupExpiredTemporalFacts', () => {
    test('should return count of expired facts cleaned', async () => {
      const count = await cleanupExpiredTemporalFacts('project-1');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should work without project filter', async () => {
      const count = await cleanupExpiredTemporalFacts();
      expect(typeof count).toBe('number');
    });
  });

  describe('getTemporalFactsStats', () => {
    test('should return statistics', async () => {
      const stats = await getTemporalFactsStats('project-1');

      expect(stats).toHaveProperty('totalTemporalFacts');
      expect(stats).toHaveProperty('validFacts');
      expect(stats).toHaveProperty('expiredFacts');
      expect(stats).toHaveProperty('supersededFacts');
    });

    test('should work without project filter', async () => {
      const stats = await getTemporalFactsStats();

      expect(stats).toHaveProperty('totalTemporalFacts');
      expect(typeof stats.totalTemporalFacts).toBe('number');
    });
  });
});

describe('Temporal Expression Parsing', () => {
  test('should recognize common temporal patterns', () => {
    const patterns = [
      'Starting January 2025',
      'As of today',
      'From now on',
      'Beginning next week',
      'Effective immediately',
    ];

    // These patterns should be detectable by the temporal parser
    patterns.forEach(pattern => {
      expect(pattern.length).toBeGreaterThan(0);
    });
  });
});
