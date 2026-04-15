import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-011: Update integration.test.ts imports', () => {
  const baseDir = process.cwd();

  test('integration.test.ts has 5 algorithm imports from core/algorithms/', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'integration.test.ts');
    const content = await readFile(testPath, 'utf-8');

    // Count imports from ../../core/algorithms/
    const algoImports = content.match(/import.*from '\.\.\/\.\.\/core\/algorithms\//g);
    expect(algoImports).toHaveLength(5);

    // Verify all 5 algorithms are imported with new paths
    expect(content).toContain("import { detectDuplicates } from '../../core/algorithms/detection/two-stage-detector.js'");
    expect(content).toContain("import { runSafetyChecks } from '../../core/algorithms/safety/safety-checks.js'");
    expect(content).toContain("import { mergeMemories, getMergeStrategy } from '../../core/algorithms/strategies/merge-strategies.js'");
    expect(content).toContain("import { estimateTokensSaved } from '../../core/algorithms/analytics/token-estimator.js'");
    expect(content).toContain("import { SimHashFilter, MinHashFilter } from '../../core/algorithms/detection/hash-filters.js'");
  });

  test('integration.test.ts does NOT use old algorithms/ path', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'integration.test.ts');
    const content = await readFile(testPath, 'utf-8');

    expect(content).not.toContain("from '../../algorithms/detection/two-stage-detector.js'");
    expect(content).not.toContain("from '../../algorithms/safety/safety-checks.js'");
    expect(content).not.toContain("from '../../algorithms/strategies/merge-strategies.js'");
    expect(content).not.toContain("from '../../algorithms/analytics/token-estimator.js'");
    expect(content).not.toContain("from '../../algorithms/detection/hash-filters.js'");
  });
});
