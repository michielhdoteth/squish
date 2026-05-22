import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const homeDir = os.homedir();

export function getInstalledMcpCommand() {
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
      type: 'local',
      command: [getInstalledMcpCommand(), '--stdio'],
      environment: {
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

function removeJsonKey(obj, keyPath) {
  if (!obj) return false;
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) return false;
    current = current[keys[i]];
  }
  const lastKey = keys[keys.length - 1];
  if (!(lastKey in current)) return false;
  delete current[lastKey];
  return true;
}

function removeCodexMcpBlock(existingToml) {
  const pattern = /\n?\[mcp_servers\.squish-memory\][\s\S]*?(?=\n\[|$)/m;
  return existingToml.replace(pattern, '');
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
    uninstall(dryRun = false) {
      const targetPath = this.path;
      const existing = readJson(targetPath);
      if (!existing) return { path: targetPath, existed: false };
      const changed = removeJsonKey(existing, 'mcpServers.squish');
      if (changed && !dryRun) {
        // Clean up empty mcpServers
        if (existing.mcpServers && Object.keys(existing.mcpServers).length === 0) {
          delete existing.mcpServers;
        }
        writeJson(targetPath, existing);
      }
      return { path: targetPath, changed };
    },
  },
  opencode: {
    path: path.join(homeDir, '.config', 'opencode', 'opencode.json'),
    install(dryRun = false) {
      const targetPath = this.path;
      const existing = readJson(targetPath) || {};
      const entry = buildOpenCodeMcpConfig();
      existing.mcp = { ...(existing.mcp || {}), ...entry };
      if (!dryRun) writeJson(targetPath, existing);
      return { path: targetPath, content: existing };
    },
    uninstall(dryRun = false) {
      const targetPath = this.path;
      const existing = readJson(targetPath);
      if (!existing) return { path: targetPath, existed: false };
      const changed = existing.mcp && 'squish-memory' in existing.mcp;
      if (changed && !dryRun) {
        delete existing.mcp['squish-memory'];
        if (Object.keys(existing.mcp).length === 0) delete existing.mcp;
        writeJson(targetPath, existing);
      }
      return { path: targetPath, changed };
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
    uninstall(dryRun = false) {
      const targetPath = this.path;
      const existing = readJson(targetPath);
      if (!existing) return { path: targetPath, existed: false };
      const changed = removeJsonKey(existing, 'mcpServers.squish');
      if (changed && !dryRun) {
        if (existing.mcpServers && Object.keys(existing.mcpServers).length === 0) {
          delete existing.mcpServers;
        }
        writeJson(targetPath, existing);
      }
      return { path: targetPath, changed };
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
    uninstall(dryRun = false) {
      const targetPath = this.path;
      if (!fs.existsSync(targetPath)) return { path: targetPath, existed: false };
      const existing = fs.readFileSync(targetPath, 'utf-8');
      const next = removeCodexMcpBlock(existing);
      const changed = next !== existing;
      if (changed && !dryRun) {
        fs.writeFileSync(targetPath, next);
      }
      return { path: targetPath, changed };
    },
  },
};
