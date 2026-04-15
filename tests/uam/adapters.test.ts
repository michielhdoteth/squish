/**
 * UAM Integration Tests
 * 
 * Tests for Universal Agent Memory adapter layer
 */

import { describe, test, expect } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';

const baseDir = process.cwd();

describe('UAM Adapter Layer', () => {
  
  test('Adapter types module file should exist', () => {
    expect(existsSync(join(baseDir, 'dist', 'core', 'adapters', 'types.js'))).toBe(true);
  });
  
  test('Adapter registry should be loadable', async () => {
    const registry = await import(join(baseDir, 'dist', 'core', 'adapters', 'index.js'));
    expect(registry.registerAdapter).toBeDefined();
    expect(registry.getAdapter).toBeDefined();
    expect(registry.listAdapters).toBeDefined();
  });
  
  test('Timeline module should be loadable', async () => {
    const timeline = await import(join(baseDir, 'dist', 'core', 'adapters', 'timeline.js'));
    expect(timeline.getTimeline).toBeDefined();
    expect(timeline.getMemoryTimeline).toBeDefined();
  });
  
  test('Agent configs should exist', () => {
    const configDir = join(baseDir, 'dist', 'core', 'adapters', 'config');
    expect(existsSync(join(configDir, 'claude-code.js'))).toBe(true);
    expect(existsSync(join(configDir, 'opencode.js'))).toBe(true);
    expect(existsSync(join(configDir, 'cursor.js'))).toBe(true);
    expect(existsSync(join(configDir, 'windsurf.js'))).toBe(true);
  });
  
  test('Install script should be buildable', () => {
    const scriptPath = join(baseDir, 'dist', 'core', 'adapters', 'scripts', 'install-adapter.js');
    expect(existsSync(scriptPath)).toBe(true);
  });
  
  test('squish_timeline MCP tool should be registered', async () => {
    const mcpPath = join(baseDir, 'dist', 'core', 'commands', 'mcp-server.js');
    const mcpContent = await Bun.file(mcpPath).text();
    expect(mcpContent).toContain('squish_timeline');
    expect(mcpContent).toContain('index');
    expect(mcpContent).toContain('timeline');
    expect(mcpContent).toContain('detail');
  });
  
  test('Database schema should have UAM columns', async () => {
    const bootstrapPath = join(baseDir, 'db', 'bootstrap.ts');
    const bootstrap = await Bun.file(bootstrapPath).text();
    expect(bootstrap).toContain('agent_id');
    expect(bootstrap).toContain('tool_name');
    expect(bootstrap).toContain('session_id');
  });
});