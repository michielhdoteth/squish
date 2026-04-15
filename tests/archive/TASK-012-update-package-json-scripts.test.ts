import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-012: Update package.json scripts', () => {
  const baseDir = process.cwd();

  test('package.json bin points to dist/core/commands/mcp-server.js', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    expect(content).toContain('"squish-mcp": "dist/core/commands/mcp-server.js"');
  });

  test('package.json mcp script uses dist/core/commands/mcp-server.js', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    expect(content).toContain('"mcp": "node dist/core/commands/mcp-server.js"');
  });

  test('package.json dev:mcp script uses core/commands/mcp-server.ts', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');

    expect(content).toContain('"dev:mcp": "bun --hot core/commands/mcp-server.ts"');
  });

  test('package.json does NOT contain old commands/ paths', async () => {
    const pkgPath = join(baseDir, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    // Check bin.squish-mcp is new path
    expect(pkg.bin['squish-mcp']).toBe('dist/core/commands/mcp-server.js');

    // Check scripts.mcp is new path
    expect(pkg.scripts.mcp).toBe('node dist/core/commands/mcp-server.js');

    // Check scripts.dev:mcp is new path
    expect(pkg.scripts['dev:mcp']).toBe('bun --hot core/commands/mcp-server.ts');

    // Ensure old paths are not present anywhere in raw content
    expect(content).not.toContain('"squish-mcp": "dist/commands/mcp-server.js"');
    expect(content).not.toContain('"mcp": "node dist/commands/mcp-server.js"');
    expect(content).not.toContain('"dev:mcp": "bun --hot commands/mcp-server.ts"');
  });
});
