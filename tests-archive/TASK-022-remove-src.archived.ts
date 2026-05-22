import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { readdir } from 'fs/promises';

describe('TASK-022: Remove src/ directory', () => {
  const baseDir = process.cwd();

  test('src/ directory should not exist', async () => {
    const srcPath = join(baseDir, 'src');
    try {
      await readdir(srcPath);
      // If we get here, the directory exists - fail
      expect(false).toBe(true);
    } catch (error: any) {
      // Expected: ENOENT
      expect(error.code).toBe('ENOENT');
    }
  });
});
