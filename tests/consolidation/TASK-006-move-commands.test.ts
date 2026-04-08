import { describe, test, expect } from 'bun:test';
import { readdir, rmdir, mkdir } from 'fs/promises';
import { join } from 'path';

describe('TASK-006: Move commands/ to core/commands/', () => {
  const baseDir = process.cwd();

  test('core/commands/ directory exists with all files', async () => {
    const coreCommandsPath = join(baseDir, 'core', 'commands');
    const files = await readdir(coreCommandsPath);

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

  test('original commands/ directory no longer exists', async () => {
    const commandsPath = join(baseDir, 'commands');
    try {
      await readdir(commandsPath);
      // If we get here, the directory still exists - fail
      expect(false).toBe(true);
    } catch (error: any) {
      // Expected: ENOENT
      expect(error.code).toBe('ENOENT');
    }
  });
});
