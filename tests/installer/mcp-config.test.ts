import { describe, expect, test } from 'bun:test';

describe('installer mcp config generation', () => {
  test('renders stdio launchers for supported clients using the installed squish-mcp binary', async () => {
    const {
      buildClaudeCodeMcpConfig,
      buildOpenCodeMcpConfig,
      buildOpenClawMcpConfig,
      buildCodexMcpConfigBlock,
    } = await import('../../bin/install-config.mjs');

    const claude = buildClaudeCodeMcpConfig();
    expect(claude.mcpServers.squish.command).toMatch(/squish-mcp/);
    expect(claude.mcpServers.squish.args).toEqual(['--stdio']);
    // Claude Code uses `env` key
    expect(claude.mcpServers.squish.env).toBeDefined();
    expect(claude.mcpServers.squish.env.SQUISH_MODE).toBe('local');

    const opencode = buildOpenCodeMcpConfig();
    expect(opencode['squish-memory'].command[0]).toMatch(/squish-mcp/);
    expect(opencode['squish-memory'].command[1]).toBe('--stdio');
    expect(opencode['squish-memory'].type).toBe('local');
    // OpenCode uses `environment` key (not `env`)
    expect(opencode['squish-memory'].environment).toBeDefined();
    expect(opencode['squish-memory'].environment!.SQUISH_MODE).toBe('local');

    const openclaw = buildOpenClawMcpConfig();
    expect(openclaw.mcpServers.squish.command).toMatch(/squish-mcp/);
    expect(openclaw.mcpServers.squish.args).toEqual(['--stdio']);

    const codexBlock = buildCodexMcpConfigBlock();
    expect(codexBlock).toContain('[mcp_servers.squish-memory]');
    expect(codexBlock).toContain('command = "');
    expect(codexBlock).toContain('squish-mcp');
    expect(codexBlock).toContain('enabled = true');
  });

  test('uses a unified shared data dir: no per-client SQUISH_DATA_DIR is written', async () => {
    const {
      buildClaudeCodeMcpConfig,
      buildOpenCodeMcpConfig,
      buildOpenCodeInlineMcpConfig,
      buildOpenClawMcpConfig,
      buildCodexMcpConfigBlock,
    } = await import('../../bin/install-config.mjs');

    const claude = buildClaudeCodeMcpConfig();
    expect(claude.mcpServers.squish.env.SQUISH_DATA_DIR).toBeUndefined();

    const opencode = buildOpenCodeMcpConfig();
    expect(opencode['squish-memory'].environment!.SQUISH_DATA_DIR).toBeUndefined();

    const opencodeInline = buildOpenCodeInlineMcpConfig();
    expect(opencodeInline.environment!.SQUISH_DATA_DIR).toBeUndefined();

    const openclaw = buildOpenClawMcpConfig();
    expect(openclaw.mcpServers.squish.env.SQUISH_DATA_DIR).toBeUndefined();

    const codexBlock = buildCodexMcpConfigBlock();
    expect(codexBlock).not.toContain('SQUISH_DATA_DIR');
  });
});
