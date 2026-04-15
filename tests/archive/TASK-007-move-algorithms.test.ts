import { describe, test, expect } from 'bun:test';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-007: Move algorithms/ to core/algorithms/', () => {
  const baseDir = process.cwd();

  test('core/algorithms/ directory exists with all subdirectories and files', async () => {
    const algoPath = join(baseDir, 'core', 'algorithms');
    const items = await readdir(algoPath);

    // Should have index.ts, types.ts, and 7 subdirectories
    expect(items).toContain('index.ts');
    expect(items).toContain('types.ts');

    const expectedDirs = [
      'analytics',
      'detection',
      'handlers',
      'operations',
      'safety',
      'strategies',
      'utils'
    ];
    expectedDirs.forEach(dir => {
      expect(items).toContain(dir);
    });

    // Verify subdirectory files
    expect(await readdir(join(algoPath, 'analytics'))).toContain('token-estimator.ts');
    expect(await readdir(join(algoPath, 'detection'))).toContain('hash-filters.ts');
    expect(await readdir(join(algoPath, 'detection'))).toContain('semantic-ranker.ts');
    expect(await readdir(join(algoPath, 'detection'))).toContain('two-stage-detector.ts');
    expect(await readdir(join(algoPath, 'handlers'))).toHaveLength(7);
    expect(await readdir(join(algoPath, 'operations'))).toContain('cache-maintenance.ts');
    expect(await readdir(join(algoPath, 'safety'))).toContain('safety-checks.ts');
    expect(await readdir(join(algoPath, 'strategies'))).toContain('merge-strategies.ts');
    expect(await readdir(join(algoPath, 'utils'))).toContain('response-builder.ts');
  });

  test('original algorithms/ directory no longer exists', async () => {
    const algoPath = join(baseDir, 'algorithms');
    try {
      await readdir(algoPath);
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe('ENOENT');
    }
  });

  test('core/algorithms/handlers contains all 7 handler files', async () => {
    const handlersPath = join(baseDir, 'core', 'algorithms', 'handlers');
    const files = await readdir(handlersPath);

    const expectedHandlers = [
      'approve-merge.ts',
      'detect-duplicates.ts',
      'get-stats.ts',
      'list-proposals.ts',
      'preview-merge.ts',
      'reject-merge.ts',
      'reverse-merge.ts'
    ];

    expect(files).toHaveLength(7);
    expectedHandlers.forEach(file => {
      expect(files).toContain(file);
    });
  });
});
