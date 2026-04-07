import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { readdir } from 'fs/promises';

describe('TASK-005: Delete core/commands/ directory', () => {
  const baseDir = process.cwd();

  test('core/commands/ directory should not exist', async () => {
    const coreCommandsPath = join(baseDir, 'core', 'commands');
    try {
      await readdir(coreCommandsPath);
      // If we get here, the directory exists - that should fail
      expect(false).toBe(true);
    } catch (error: any) {
      // Expected: directory doesn't exist, readdir throws
      expect(error.code).toBe('ENOENT');
    }
  });

  test('core/commands/ files are gone', async () => {
    const coreCommandsPath = join(baseDir, 'core', 'commands');
    try {
      const files = await readdir(coreCommandsPath);
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      // Expected: ENOENT
      expect(error.code).toBe('ENOENT');
    }
  });
});
