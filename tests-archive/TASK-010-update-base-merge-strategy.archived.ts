import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-010: Update base-merge-strategy.test.ts imports', () => {
  const baseDir = process.cwd();

  test('base-merge-strategy.test.ts uses core/algorithms/strategies/ paths', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'base-merge-strategy.test.ts');
    const content = await readFile(testPath, 'utf-8');

    // Should have 2 references: one import statement and one inline type import
    const statementImports = content.match(/import.*from '\.\.\/\.\.\/core\/algorithms\/strategies\//g) || [];
    const inlineImports = content.match(/import\(['"]\.\.\/\.\.\/core\/algorithms\/strategies\//g) || [];

    expect(statementImports.length + inlineImports.length).toBe(2);

    // Verify specific references
    expect(content).toContain("import { BaseMergeStrategy } from '../../core/algorithms/strategies/merge-strategies.js'");
    expect(content).toContain("import('../../core/algorithms/strategies/merge-strategies.js').MergedMemory");
  });

  test('base-merge-strategy.test.ts does NOT use old algorithms/ path', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'base-merge-strategy.test.ts');
    const content = await readFile(testPath, 'utf-8');

    expect(content).not.toContain("from '../../algorithms/strategies/merge-strategies.js'");
    expect(content).not.toContain("import('../../algorithms/strategies/merge-strategies.js')");
  });
});
