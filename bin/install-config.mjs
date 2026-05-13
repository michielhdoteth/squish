import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const homeDir = os.homedir();

function getInstalledMcpCommand() {
  return process.platform === 'win32' ? 'squish-mcp.cmd' : 'squish-mcp';
}

function buildBaseMcpServer(name, dataDir) {
  return {
    [name]: {
      command: getInstalledMcpCommand(),
      args: ['--stdio'],
      env: {
        SQUISH_MODE: 'local',
        SQUISH_DATA_DIR: dataDir,
      },
    },
  };
}

export function buildClaudeCodeMcpConfig() {
  return {
    mcpServers: buildBaseMcpServer('squish', '~/.squish/claude'),
  };
}

export function buildOpenCodeMcpConfig() {
  return {
    'squish-memory': {
      type: 'stdio',
      command: [getInstalledMcpCommand(), '--stdio'],
      env: {
        SQUISH_MODE: 'local',
        SQUISH_DATA_DIR: '~/.squish/opencode',
      },
      enabled: true,
    },
  };
}

export function buildOpenCodeInlineMcpConfig() {
  return {
    type: 'local',
    command: [getInstalledMcpCommand(), '--stdio'],
    environment: {
      SQUISH_MODE: 'local',
      SQUISH_DATA_DIR: '~/.squish/opencode',
    },
    enabled: true,
  };
}

export function buildOpenClawMcpConfig() {
  return {
    mcpServers: buildBaseMcpServer('squish', '~/.squish/openclaw'),
  };
}

export function buildCodexMcpConfigBlock() {
  return `
[mcp_servers.squish-memory]
command = "${getInstalledMcpCommand()}"
args = [ "--stdio" ]
enabled = true

  [mcp_servers.squish-memory.env]
  SQUISH_MODE = "local"
  SQUISH_DATA_DIR = "~/.squish/codex"
`.trim();
}

function mergeMcpServers(existing, addition) {
  return {
    ...existing,
    mcpServers: {
      ...(existing?.mcpServers || {}),
      ...addition.mcpServers,
    },
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function upsertCodexMcpBlock(existingToml) {
  const block = buildCodexMcpConfigBlock();
  const pattern = /\[mcp_servers\.squish-memory\][\s\S]*?(?=\n\[|$)/m;
  if (pattern.test(existingToml)) {
    return existingToml.replace(pattern, block);
  }
  return existingToml.trimEnd() ? `${existingToml.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

export const CLIENT_MCP_TARGETS = {
  'claude-code': {
    path: path.join(homeDir, '.claude', 'mcp.json'),
    install(dryRun = false) {
      const targetPath = this.path;
      const next = mergeMcpServers(readJson(targetPath), buildClaudeCodeMcpConfig());
      if (!dryRun) writeJson(targetPath, next);
      return { path: targetPath, content: next };
    },
  },
  opencode: {
    path: path.join(homeDir, '.config', 'opencode', 'mcp-servers.json'),
    install(dryRun = false) {
      const targetPath = this.path;
      const next = {
        ...readJson(targetPath),
        ...buildOpenCodeMcpConfig(),
      };
      if (next.mcpServers?.['squish-memory']) {
        delete next.mcpServers['squish-memory'];
        if (Object.keys(next.mcpServers).length === 0) {
          delete next.mcpServers;
        }
      }
      if (!dryRun) writeJson(targetPath, next);
      return { path: targetPath, content: next };
    },
  },
  openclaw: {
    path: path.join(homeDir, '.openclaw', 'mcporter.json'),
    install(dryRun = false) {
      const targetPath = this.path;
      const next = mergeMcpServers(readJson(targetPath), buildOpenClawMcpConfig());
      if (!dryRun) writeJson(targetPath, next);
      return { path: targetPath, content: next };
    },
  },
  codex: {
    path: path.join(homeDir, '.codex', 'config.toml'),
    install(dryRun = false) {
      const targetPath = this.path;
      const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : '';
      const next = upsertCodexMcpBlock(existing);
      if (!dryRun) {
        ensureDir(targetPath);
        fs.writeFileSync(targetPath, next);
      }
      return { path: targetPath, content: next };
    },
  },
};
