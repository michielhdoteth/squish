import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-002: Comprehensive Reference Scan', () => {
  const baseDir = process.cwd();

  test('index.ts has 7 algorithm handler imports', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    // Count imports from ./algorithms/handlers/
    const handlerImports = content.match(/import.*from '\.\/algorithms\/handlers\//g);
    expect(handlerImports).toHaveLength(7);

    // Verify specific handlers are imported
    expect(content).toContain("import { handleDetectDuplicates } from './algorithms/handlers/detect-duplicates.js'");
    expect(content).toContain("import { handleListProposals } from './algorithms/handlers/list-proposals.js'");
    expect(content).toContain("import { handlePreviewMerge } from './algorithms/handlers/preview-merge.js'");
    expect(content).toContain("import { handleApproveMerge } from './algorithms/handlers/approve-merge.js'");
    expect(content).toContain("import { handleRejectMerge } from './algorithms/handlers/reject-merge.js'");
    expect(content).toContain("import { handleReverseMerge } from './algorithms/handlers/reverse-merge.js'");
    expect(content).toContain("import { handleGetMergeStats } from './algorithms/handlers/get-stats.js'");
  });

  test('index.ts has comment reference to commands/mcp-server.ts', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    expect(content).toContain('// MCP server: commands/mcp-server.ts');
  });

  test('base-merge-strategy.test.ts has 2 algorithm strategy references', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'base-merge-strategy.test.ts');
    const content = await readFile(testPath, 'utf-8');

    // Count imports from ../../algorithms/strategies/ (both statement and inline)
    const statementImports = content.match(/import.*from '\.\.\/\.\.\/algorithms\/strategies\//g) || [];
    const inlineImports = content.match(/import\(['"]\.\.\/\.\.\/algorithms\/strategies\//g) || [];

    expect(statementImports.length + inlineImports.length).toBe(2);

    // Verify both import types exist
    expect(content).toContain("import { BaseMergeStrategy } from '../../algorithms/strategies/merge-strategies.js'");
    expect(content).toContain("import('../../algorithms/strategies/merge-strategies.js').MergedMemory");
  });

  test('integration.test.ts has 5 algorithm imports', async () => {
    const testPath = join(baseDir, 'tests', 'merge', 'integration.test.ts');
    const content = await readFile(testPath, 'utf-8');

    // Count imports from ../../algorithms/
    const algoImports = content.match(/import.*from '\.\.\/\.\.\/algorithms\//g);
    expect(algoImports).toHaveLength(5);

    // Verify all 5 algorithms are imported
    expect(content).toContain("import { detectDuplicates } from '../../algorithms/detection/two-stage-detector.js'");
    expect(content).toContain("import { runSafetyChecks } from '../../algorithms/safety/safety-checks.js'");
    expect(content).toContain("import { mergeMemories, getMergeStrategy } from '../../algorithms/strategies/merge-strategies.js'");
    expect(content).toContain("import { estimateTokensSaved } from '../../algorithms/analytics/token-estimator.js'");
    expect(content).toContain("import { SimHashFilter, MinHashFilter } from '../../algorithms/detection/hash-filters.js'");
  });

  test('package.json has 3 script/bin references to commands/', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    // Count references to dist/commands/mcp-server.js or commands/mcp-server.ts
    const commandRefs = content.match(/dist\/commands\/mcp-server\.js/g);
    expect(commandRefs).toHaveLength(2); // bin and mcp script

    const devMcp = content.match(/commands\/mcp-server\.ts/g);
    expect(devMcp).toHaveLength(1); // dev:mcp script
  });

  test('package.json has 10 markdown files in "files" array', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    // Count markdown entries in files array that reference commands/
    const filesMatch = content.match(/"files":\s*\[([\s\S]*?)\]/);
    expect(filesMatch).not.toBeNull();
    const filesSection = filesMatch![1];

    const commandsMdFiles = filesSection.match(/commands\/.*\.md/g);
    expect(commandsMdFiles).toHaveLength(10);
  });

  test('tsconfig.json has commands/**/*.ts include pattern', async () => {
    const tsconfigPath = join(baseDir, 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');

    expect(content).toContain('"commands/**/*.ts"');
  });

  test('config/plugin.json has commands path reference', async () => {
    const pluginPath = join(baseDir, 'config', 'plugin.json');
    const content = await readFile(pluginPath, 'utf-8');

    expect(content).toContain('"commands": "./commands/"');
  });

  test('mcp.json.example has dist/commands/mcp-server.js reference', async () => {
    const mcpPath = join(baseDir, 'mcp.json.example');
    const content = await readFile(mcpPath, 'utf-8');

    expect(content).toContain('"args": ["dist/commands/mcp-server.js"]');
  });

  test('config/plugin-manifest.json has mcp entry point reference', async () => {
    const manifestPath = join(baseDir, 'config', 'plugin-manifest.json');
    const content = await readFile(manifestPath, 'utf-8');

    expect(content).toContain('"mcp": "dist/commands/mcp-server.js"');
  });
});
