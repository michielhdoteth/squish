import { describe, test, expect } from 'bun:test';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-018: Build TypeScript project', () => {
  const baseDir = process.cwd();

  test('dist/core/commands/mcp-server.js exists', async () => {
    const filePath = join(baseDir, 'dist', 'core', 'commands', 'mcp-server.js');
    try {
      await readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Expected file not found: ${filePath}`);
      }
      throw error;
    }
  });

  test('dist/core/algorithms/handlers directory contains compiled handlers', async () => {
    const handlersDir = join(baseDir, 'dist', 'core', 'algorithms', 'handlers');
    const files = await readdir(handlersDir);

    const expectedHandlers = [
      'approve-merge.js',
      'detect-duplicates.js',
      'get-stats.js',
      'list-proposals.js',
      'preview-merge.js',
      'reject-merge.js',
      'reverse-merge.js'
    ];

    expectedHandlers.forEach(file => {
      expect(files).toContain(file);
    });
  });

  test('build succeeded: dist/index.js exists', async () => {
    const indexPath = join(baseDir, 'dist', 'index.js');
    await readFile(indexPath, 'utf-8');
  });
});
