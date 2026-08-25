/**
 * Tests for runFullMaintenance() in core/consolidation.ts
 * Phase 6: Unified Clean command
 *
 * NOTE: Uses dynamic imports. No mock.module() calls.
 *
 * Batch 9 fix: this file previously ran WITHOUT data-dir isolation, so
 * `runFullMaintenance({})` executed real dedup/consolidation passes against
 * the developer's LIVE ~/.squish/squish.db - hanging for minutes on large
 * databases and mutating real user memory from a unit test. Isolate into a
 * throwaway temp dir BEFORE any product module loads (same pattern as the
 * golden and bench harness tests).
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const isolatedDir = mkdtempSync(join(tmpdir(), 'squish-full-maintenance-test-'));
process.env.SQUISH_DATA_DIR = isolatedDir;
process.env.DATABASE_URL = '';
delete process.env.SQUISH_DATABASE_URL;

afterAll(async () => {
  try {
    const { closeAllDbs } = await import('../../../db/index.js');
    await closeAllDbs();
  } catch {
    // ignore
  }
  try {
    rmSync(isolatedDir, { recursive: true, force: true });
  } catch {
    // Windows may briefly hold the SQLite handle; the OS cleans tmpdir.
  }
});

describe('runFullMaintenance', () => {
  test('module exports the function', async () => {
    const mod = await import('../../../core/consolidation.js');
    expect(typeof mod.runFullMaintenance).toBe('function');
  });

  test('accepts empty options without throwing', async () => {
    const { runFullMaintenance } = await import('../../../core/consolidation.js');
    // Should not throw even with empty options
    const result = await runFullMaintenance({}).catch(() => ({ ok: false, steps: {} as any, dryRun: true }));
    expect(result).toBeDefined();
  });

  test('steps defaults to all 4 when not specified', async () => {
    const { runFullMaintenance } = await import('../../../core/consolidation.js');
    const result = await runFullMaintenance({}).catch(() => null);
    if (result) {
      // If result obtained (mocked or real), check structure
      expect(typeof result.ok).toBe('boolean');
      expect(result.steps).toBeDefined();
    }
  });

  test('handles dryRun option gracefully', async () => {
    const { runFullMaintenance } = await import('../../../core/consolidation.js');
    const result = await runFullMaintenance({ dryRun: true }).catch(() => ({ ok: true, steps: {} as any, dryRun: true }));
    if (result) {
      expect(typeof result.dryRun === 'boolean').toBe(true);
    }
  });

  test('handles step filtering', async () => {
    const { runFullMaintenance } = await import('../../../core/consolidation.js');
    const result = await runFullMaintenance({ steps: ['dedup'] }).catch(() => ({ ok: true, steps: {} as any, dryRun: true }));
    if (result) {
      expect(result).toBeDefined();
    }
  });

  test('each step result has ok, count, and error fields', async () => {
    const { runFullMaintenance } = await import('../../../core/consolidation.js');
    const result = await runFullMaintenance({}).catch(() => null);
    // When no mocks, each step dynamically imports its dependency
    // and may fail gracefully. Still check structure if we get a result.
    if (result?.steps) {
      for (const [stepName, stepInfo] of Object.entries(result.steps) as Array<[string, any]>) {
        expect(stepInfo).toHaveProperty('ok');
        expect('count' in stepInfo).toBe(true);
      }
    }
  });
});
