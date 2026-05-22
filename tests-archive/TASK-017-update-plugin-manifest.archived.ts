import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-017: Update config/plugin-manifest.json', () => {
  const baseDir = process.cwd();

  test('config/plugin-manifest.json entry.mcp is dist/core/commands/mcp-server.js', async () => {
    const manifestPath = join(baseDir, 'config', 'plugin-manifest.json');
    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    expect(manifest.entry.mcp).toBe('dist/core/commands/mcp-server.js');
  });

  test('config/plugin-manifest.json does NOT contain old dist/commands/mcp-server.js path', async () => {
    const manifestPath = join(baseDir, 'config', 'plugin-manifest.json');
    const content = await readFile(manifestPath, 'utf-8');

    expect(content).not.toContain('"mcp": "dist/commands/mcp-server.js"');
  });
});
