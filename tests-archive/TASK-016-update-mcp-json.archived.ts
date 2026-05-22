import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-016: Update mcp.json.example', () => {
  const baseDir = process.cwd();

  test('mcp.json.example args points to dist/core/commands/mcp-server.js', async () => {
    const mcpPath = join(baseDir, 'mcp.json.example');
    const content = await readFile(mcpPath, 'utf-8');
    const mcpConfig = JSON.parse(content);

    expect(mcpConfig.mcpServers.squish.args[0]).toBe('dist/core/commands/mcp-server.js');
  });

  test('mcp.json.example does NOT contain old dist/commands/mcp-server.js path', async () => {
    const mcpPath = join(baseDir, 'mcp.json.example');
    const content = await readFile(mcpPath, 'utf-8');

    expect(content).not.toContain('"args": ["dist/commands/mcp-server.js"]');
  });
});
