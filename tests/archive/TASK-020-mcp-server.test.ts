import { describe, test, expect } from 'bun:test';
import { spawn } from 'child_process';

describe('TASK-020: Test MCP server', () => {
  test('MCP server starts without errors', async () => {
    // Start the MCP server
    const proc = spawn('node', ['dist/core/commands/mcp-server.js'], {
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data.toString()));
    proc.stderr.on('data', (data) => (stderr += data.toString()));

    // Wait a short time for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Kill the server
    proc.kill('SIGTERM');

    // Wait for exit
    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const combined = stdout + stderr;
    // We expect the server to start and register tools
    expect(combined).toContain('Connected via stdio');
    expect(combined).toContain('Registered tool: squish_search');
    // The server should have started without crashing
  }, 10000);
});
