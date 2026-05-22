import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-013: Update package.json files array', () => {
  const baseDir = process.cwd();

  test('package.json files array contains core/commands/ markdown files', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    const expectedFiles = [
      'core/commands/context-paging.md',
      'core/commands/context-status.md',
      'core/commands/context.md',
      'core/commands/core-memory.md',
      'core/commands/health.md',
      'core/commands/init.md',
      'core/commands/merge.md',
      'core/commands/recall.md',
      'core/commands/remember.md',
      'core/commands/search.md'
    ];

    expectedFiles.forEach(file => {
      expect(pkg.files).toContain(file);
    });
  });

  test('package.json files array does NOT contain old commands/ paths', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    const oldFiles = [
      'commands/context-paging.md',
      'commands/context-status.md',
      'commands/context.md',
      'commands/core-memory.md',
      'commands/health.md',
      'commands/init.md',
      'commands/merge.md',
      'commands/recall.md',
      'commands/remember.md',
      'commands/search.md'
    ];

    oldFiles.forEach(file => {
      expect(content).not.toContain(`"${file}"`);
    });
  });
});
