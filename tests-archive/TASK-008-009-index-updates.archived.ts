import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-008 & TASK-009: Update index.ts imports and comment', () => {
  const baseDir = process.cwd();

  test('index.ts has 7 handler imports from core/algorithms/handlers/', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    // Count imports from ./core/algorithms/handlers/
    const handlerImports = content.match(/import.*from '\.\/core\/algorithms\/handlers\//g);
    expect(handlerImports).toHaveLength(7);

    // Verify specific handlers are imported with new paths
    expect(content).toContain("import { handleDetectDuplicates } from './core/algorithms/handlers/detect-duplicates.js'");
    expect(content).toContain("import { handleListProposals } from './core/algorithms/handlers/list-proposals.js'");
    expect(content).toContain("import { handlePreviewMerge } from './core/algorithms/handlers/preview-merge.js'");
    expect(content).toContain("import { handleApproveMerge } from './core/algorithms/handlers/approve-merge.js'");
    expect(content).toContain("import { handleRejectMerge } from './core/algorithms/handlers/reject-merge.js'");
    expect(content).toContain("import { handleReverseMerge } from './core/algorithms/handlers/reverse-merge.js'");
    expect(content).toContain("import { handleGetMergeStats } from './core/algorithms/handlers/get-stats.js'");
  });

  test('index.ts comment references core/commands/mcp-server.ts', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    expect(content).toContain('// MCP server: core/commands/mcp-server.ts');
  });

  test('index.ts does NOT contain old algorithms/handlers imports', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    expect(content).not.toContain("from './algorithms/handlers/detect-duplicates.js'");
    expect(content).not.toContain("from './algorithms/handlers/list-proposals.js'");
    expect(content).not.toContain("from './algorithms/handlers/preview-merge.js'");
    expect(content).not.toContain("from './algorithms/handlers/approve-merge.js'");
    expect(content).not.toContain("from './algorithms/handlers/reject-merge.js'");
    expect(content).not.toContain("from './algorithms/handlers/reverse-merge.js'");
    expect(content).not.toContain("from './algorithms/handlers/get-stats.js'");
  });

  test('index.ts does NOT contain old commands/mcp-server.ts comment', async () => {
    const indexPath = join(baseDir, 'index.ts');
    const content = await readFile(indexPath, 'utf-8');

    expect(content).not.toContain('// MCP server: commands/mcp-server.ts');
  });
});
