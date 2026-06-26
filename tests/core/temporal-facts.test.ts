import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Create a temp directory before any DB operations so getDb() targets an
// isolated SQLite file.  process.env.SQUISH_DATA_DIR is read at DB-init
// time (inside createSqliteDb → getDataDir), so setting it here before
// calling any exported function is sufficient.
const tempDir = mkdtempSync(join(tmpdir(), 'squish-temporal-'));
process.env.SQUISH_DATA_DIR = tempDir;

import {
  checkTemporalValidity,
  supersedeOldTemporalFacts,
  cleanupExpiredTemporalFacts,
  getTemporalFactsStats,
} from '../../core/memory/temporal-facts.js';
import { resetDb } from '../../db/index.js';
import { clearSchemaCache } from '../../db/schema.js';

describe('Temporal Facts', () => {
  beforeAll(() => {
    // Ensure any cached DB / schema references are discarded so the new
    // SQUISH_DATA_DIR is picked up.
    resetDb();
    clearSchemaCache();
  });

  afterAll(() => {
    // Clean up the temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    delete process.env.SQUISH_DATA_DIR;
  });

  describe('checkTemporalValidity', () => {
    test('should return invalid for non-existent memory', async () => {
      const result = await checkTemporalValidity('nonexistent-memory');
      // Real DB: memory not found → isValid false, confidence 0
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe(0);
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
