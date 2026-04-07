import { describe, test, expect } from 'bun:test';
import { readdir } from 'fs/promises';
import { join } from 'path';

describe('TASK-001: Directory Structure Inventory', () => {
  const baseDir = process.cwd();

  test('commands/ directory exists with correct files', async () => {
    const commandsPath = join(baseDir, 'commands');
    const files = await readdir(commandsPath);

    // Should have 13 files total: 11 .md + 2 .ts
    expect(files).toHaveLength(13);

    const mdFiles = files.filter(f => f.endsWith('.md'));
    const tsFiles = files.filter(f => f.endsWith('.ts'));

    expect(mdFiles).toHaveLength(11);
    expect(tsFiles).toHaveLength(2);

    // Verify specific markdown files exist
    const expectedMd = [
      'context-paging.md',
      'context-status.md',
      'context.md',
      'core-memory.md',
      'health.md',
      'init.md',
      'merge.md',
      'observe.md',
      'recall.md',
      'remember.md',
      'search.md'
    ];
    expectedMd.forEach(file => {
      expect(files).toContain(file);
    });

    // Verify TypeScript files exist
    expect(files).toContain('managed-sync.ts');
    expect(files).toContain('mcp-server.ts');
  });

  test('algorithms/ directory exists with correct subdirectories', async () => {
    const algorithmsPath = join(baseDir, 'algorithms');
    const items = await readdir(algorithmsPath);

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
  });

  test('algorithms/handlers/ contains all handler files', async () => {
    const handlersPath = join(baseDir, 'algorithms', 'handlers');
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

  test('core/commands/ directory exists with duplicate files', async () => {
    const coreCommandsPath = join(baseDir, 'core', 'commands');
    const files = await readdir(coreCommandsPath);

    // Should have 2 files: managed-sync.ts and mcp-server.ts (duplicates)
    expect(files).toHaveLength(2);
    expect(files).toContain('managed-sync.ts');
    expect(files).toContain('mcp-server.ts');
  });

  test('algorithms/strategies/ contains merge-strategies.ts', async () => {
    const strategiesPath = join(baseDir, 'algorithms', 'strategies');
    const files = await readdir(strategiesPath);

    expect(files).toContain('merge-strategies.ts');
  });

  test('algorithms/analytics/ contains token-estimator.ts', async () => {
    const analyticsPath = join(baseDir, 'algorithms', 'analytics');
    const files = await readdir(analyticsPath);

    expect(files).toContain('token-estimator.ts');
  });

  test('algorithms/detection/ contains required files', async () => {
    const detectionPath = join(baseDir, 'algorithms', 'detection');
    const files = await readdir(detectionPath);

    expect(files).toContain('hash-filters.ts');
    expect(files).toContain('semantic-ranker.ts');
    expect(files).toContain('two-stage-detector.ts');
  });

  test('algorithms/safety/ contains safety-checks.ts', async () => {
    const safetyPath = join(baseDir, 'algorithms', 'safety');
    const files = await readdir(safetyPath);

    expect(files).toContain('safety-checks.ts');
  });

  test('algorithms/operations/ contains cache-maintenance.ts', async () => {
    const operationsPath = join(baseDir, 'algorithms', 'operations');
    const files = await readdir(operationsPath);

    expect(files).toContain('cache-maintenance.ts');
  });

  test('algorithms/utils/ contains response-builder.ts', async () => {
    const utilsPath = join(baseDir, 'algorithms', 'utils');
    const files = await readdir(utilsPath);

    expect(files).toContain('response-builder.ts');
  });
});
