import { describe, test, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('TASK-015: Update config/plugin.json', () => {
  const baseDir = process.cwd();

  test('config/plugin.json commands path is ./core/commands/', async () => {
    const pluginPath = join(baseDir, 'config', 'plugin.json');
    const content = await readFile(pluginPath, 'utf-8');
    const plugin = JSON.parse(content);

    expect(plugin.commands).toBe('./core/commands/');
  });

  test('config/plugin.json does NOT contain old ./commands/ path', async () => {
    const pluginPath = join(baseDir, 'config', 'plugin.json');
    const content = await readFile(pluginPath, 'utf-8');

    expect(content).not.toContain('"commands": "./commands/"');
  });
});
