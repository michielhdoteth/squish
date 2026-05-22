import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-014: Update tsconfig.json include pattern', () => {
  const baseDir = process.cwd();

  test('tsconfig.json includes core/commands/**/*.ts', async () => {
    const tsconfigPath = join(baseDir, 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');

    expect(content).toContain('"core/commands/**/*.ts"');
  });

  test('tsconfig.json does NOT contain old commands/**/*.ts pattern', async () => {
    const tsconfigPath = join(baseDir, 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');

    expect(content).not.toContain('"commands/**/*.ts"');
  });
});
