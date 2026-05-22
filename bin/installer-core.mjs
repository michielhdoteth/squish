#!/usr/bin/env node

/**
 * Squish Installer Core Engine
 *
 * Pure core logic for MCP config installation, plugin installation,
 * hook injection, and clean uninstall. No UI, no colors, no prompts.
 *
 * Used by:
 *   - packages/cli/src/commands/install.ts (CLI)
 *   - bin/install-interactive.mjs (standalone)
 *
 * Architecture:
 *   installer-core.mjs  -->  install-config.mjs (MCP config builders)
 *                        -->  plugin/{client}/    (plugin source files)
 *                        -->  plugin/templates/   (hook templates)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  CLIENT_MCP_TARGETS,
} from './install-config.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pluginDir = path.join(root, 'plugin');
const templatesDir = path.join(pluginDir, 'templates', 'hooks');
const homeDir = os.homedir();
const MANIFEST_PATH = path.join(homeDir, '.squish', 'install-manifest.json');

// ---------------------------------------------------------------------------
// Client metadata
// ---------------------------------------------------------------------------

export const SUPPORTED_AGENTS = [
  'claude-code',
  'opencode',
  'openclaw',
  'codex',
];

const CLIENT_DIRS = {
  'claude-code': path.join(homeDir, '.claude'),
  'opencode': path.join(homeDir, '.config', 'opencode'),
  'openclaw': path.join(homeDir, '.openclaw'),
  'codex': path.join(homeDir, '.codex'),
};

const CLIENT_NAMES = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'openclaw': 'OpenClaw',
  'codex': 'Codex',
};

const PLUGIN_CLIENTS = new Set(['claude-code', 'opencode', 'openclaw', 'codex']);
const HOOK_CLIENTS = new Set(['claude-code', 'opencode']);

export function getClientName(client) {
  return CLIENT_NAMES[client] || client;
}

// ---------------------------------------------------------------------------
// Client detection
// ---------------------------------------------------------------------------

export function detectClients() {
  const detected = [];

  for (const [client, dir] of Object.entries(CLIENT_DIRS)) {
    try {
      if (fs.existsSync(dir)) {
        detected.push(client);
      }
    } catch {
      // permission error, skip
    }
  }

  return detected;
}

// ---------------------------------------------------------------------------
// Bun shim / PATH shadow detection
// ---------------------------------------------------------------------------

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function isBunShimPath(value) {
  const normalized = normalizePath(value).toLowerCase();
  return normalized.includes('/.bun/bin/') || normalized.includes('/.bun/install/global/');
}

function listCommandPaths(command) {
  if (process.platform === 'win32') {
    const result = spawnSync('where.exe', [command], { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) return [];
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  const result = spawnSync('which', ['-a', command], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function checkShadowIssues() {
  const commands = ['squish', 'squish-mcp'];
  const issues = [];

  for (const command of commands) {
    const paths = listCommandPaths(command);
    if (paths.length < 2) continue;
    const [first, ...rest] = paths;
    if (!isBunShimPath(first)) continue;
    const nonBunAlternates = rest.filter((candidate) => !isBunShimPath(candidate));
    if (nonBunAlternates.length === 0) continue;
    issues.push({
      command,
      first,
      alternates: nonBunAlternates,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Manifest (track what's installed for clean uninstall)
// ---------------------------------------------------------------------------

export function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch {
    // corrupt manifest, start fresh
  }
  return { version: 1, clients: {} };
}

export function saveManifest(data) {
  try {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

function recordInstall(client, type) {
  const manifest = loadManifest();
  if (!manifest.clients[client]) {
    manifest.clients[client] = { installed: [] };
  }
  if (!manifest.clients[client].installed.includes(type)) {
    manifest.clients[client].installed.push(type);
  }
  saveManifest(manifest);
}

function recordUninstall(client, type) {
  const manifest = loadManifest();
  if (manifest.clients[client]) {
    manifest.clients[client].installed = manifest.clients[client].installed.filter(t => t !== type);
    if (manifest.clients[client].installed.length === 0) {
      delete manifest.clients[client];
    }
  }
  saveManifest(manifest);
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // corrupt file
  }
  return null;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function copyDirectory(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyDir(src, dest) {
  copyDirectory(src, dest);
}

function removeDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // permission error
  }
}

// ---------------------------------------------------------------------------
// MCP Install / Uninstall
// ---------------------------------------------------------------------------

export function installMCP(client, { dryRun = false } = {}) {
  const target = CLIENT_MCP_TARGETS[client];
  if (!target) {
    return { ok: false, error: `Unsupported client: ${client}` };
  }

  try {
    const result = target.install(dryRun);
    if (!dryRun) {
      recordInstall(client, 'mcp');
    }
    return { ok: true, path: result.path };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export function uninstallMCP(client, { dryRun = false } = {}) {
  const target = CLIENT_MCP_TARGETS[client];
  if (!target) {
    return { ok: false, error: `Unsupported client: ${client}` };
  }

  try {
    const result = target.uninstall(dryRun);
    if (!dryRun) {
      recordUninstall(client, 'mcp');
    }
    return { ok: true, path: result.path, changed: result.changed };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

// ---------------------------------------------------------------------------
// Plugin Install / Uninstall
// ---------------------------------------------------------------------------

export function installPlugin(client, { dryRun = false } = {}) {
  if (!PLUGIN_CLIENTS.has(client)) {
    return { ok: false, error: `Client does not support plugins: ${client}` };
  }

  const sourcePluginDir = path.join(pluginDir, client);
  if (!fs.existsSync(sourcePluginDir)) {
    return { ok: false, error: `Plugin source not found for: ${client}` };
  }

  try {
    const targetDir = getPluginTargetDir(client);
    if (dryRun) {
      return { ok: true, path: targetDir };
    }

    // Copy plugin files
    copyDir(sourcePluginDir, targetDir);

    // Enable plugin in client config
    enablePluginInConfig(client);

    recordInstall(client, 'plugin');
    return { ok: true, path: targetDir };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export function uninstallPlugin(client, { dryRun = false } = {}) {
  if (!PLUGIN_CLIENTS.has(client)) {
    return { ok: false, error: `Client does not support plugins: ${client}` };
  }

  try {
    const targetDir = getPluginTargetDir(client);
    if (dryRun) {
      return { ok: true, path: targetDir };
    }

    // Remove plugin files
    removeDir(targetDir);

    // Disable plugin in client config
    disablePluginInConfig(client);

    recordUninstall(client, 'plugin');
    return { ok: true, path: targetDir };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function getPluginTargetDir(client) {
  switch (client) {
    case 'claude-code':
      return path.join(homeDir, '.claude', 'plugins', 'squish-memory');
    case 'opencode':
      return path.join(homeDir, '.config', 'opencode', 'plugins', 'squish-memory');
    case 'openclaw':
      return path.join(homeDir, '.openclaw', 'plugins', 'squish-memory');
    case 'codex':
      return path.join(homeDir, '.codex', 'plugins', 'squish-memory');
    default:
      throw new Error(`Unknown plugin target for: ${client}`);
  }
}

function enablePluginInConfig(client) {
  switch (client) {
    case 'claude-code': {
      const configPath = path.join(homeDir, '.claude', 'settings.json');
      const config = readJson(configPath) || {};
      if (!config.enabledPlugins) config.enabledPlugins = [];
      if (!config.enabledPlugins.includes('squish-memory')) {
        config.enabledPlugins.push('squish-memory');
        writeJson(configPath, config);
      }
      break;
    }
    case 'opencode': {
      // OpenCode auto-loads local plugins from ~/.config/opencode/plugins/
      // No config.plugin modification needed
      break;
    }
    case 'openclaw': {
      const configPath = path.join(homeDir, '.openclaw', 'config.json');
      const config = readJson(configPath) || {};
      if (!config.plugins) config.plugins = {};
      if (!config.plugins.entries) config.plugins.entries = {};
      config.plugins.entries['squish-memory'] = { enabled: true };
      writeJson(configPath, config);
      break;
    }
    case 'codex': {
      // Codex registers plugins in config.toml
      const configPath = path.join(homeDir, '.codex', 'config.toml');
      const pluginEntry = '\n[plugins."squish-memory@local"]\nenabled = true\n';
      let content = '';
      if (fs.existsSync(configPath)) {
        content = fs.readFileSync(configPath, 'utf-8');
        if (content.includes('squish-memory@local')) break; // already registered
      }
      content += pluginEntry;
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, content, 'utf-8');
      break;
    }
  }
}

function disablePluginInConfig(client) {
  switch (client) {
    case 'claude-code': {
      const configPath = path.join(homeDir, '.claude', 'settings.json');
      const config = readJson(configPath);
      if (config && config.enabledPlugins) {
        config.enabledPlugins = config.enabledPlugins.filter(p => p !== 'squish-memory');
        writeJson(configPath, config);
      }
      break;
    }
    case 'opencode': {
      // OpenCode auto-loads local plugins -- just delete the plugin directory
      break;
    }
    case 'openclaw': {
      const configPath = path.join(homeDir, '.openclaw', 'config.json');
      const config = readJson(configPath);
      if (config && config.plugins && config.plugins.entries) {
        delete config.plugins.entries['squish-memory'];
        writeJson(configPath, config);
      }
      break;
    }
    case 'codex': {
      const configPath = path.join(homeDir, '.codex', 'config.toml');
      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf-8');
        const pattern = /\n?\[plugins\."squish-memory@local"\][\s\S]*?(?=\n\[|$)/m;
        content = content.replace(pattern, '');
        fs.writeFileSync(configPath, content, 'utf-8');
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Hook Install / Uninstall
// ---------------------------------------------------------------------------

export function installHooks(client, { dryRun = false } = {}) {
  if (!HOOK_CLIENTS.has(client)) {
    return { ok: false, error: `Client does not support hooks: ${client}` };
  }

  try {
    const templateName = getHookTemplateName(client);
    const templatePath = path.join(templatesDir, templateName);

    if (!fs.existsSync(templatePath)) {
      return { ok: false, error: `Hook template not found: ${templateName}` };
    }

    const settingsPath = getHookSettingsPath(client);
    if (dryRun) {
      return { ok: true, path: settingsPath };
    }

    const hookDir = path.join(pluginDir, 'scripts');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    const hooksConfig = JSON.parse(
      JSON.stringify(template).replace(/\{\{HOOK_DIR\}\}/g, hookDir.replace(/\\/g, '/'))
    );

    const settings = readJson(settingsPath) || {};
    settings.hooks = hooksConfig;
    writeJson(settingsPath, settings);

    recordInstall(client, 'hooks');
    return { ok: true, path: settingsPath };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export function uninstallHooks(client, { dryRun = false } = {}) {
  if (!HOOK_CLIENTS.has(client)) {
    return { ok: false, error: `Client does not support hooks: ${client}` };
  }

  try {
    const settingsPath = getHookSettingsPath(client);
    if (dryRun) {
      return { ok: true, path: settingsPath };
    }

    const settings = readJson(settingsPath);
    if (settings && settings.hooks) {
      delete settings.hooks;
      writeJson(settingsPath, settings);
    }

    recordUninstall(client, 'hooks');
    return { ok: true, path: settingsPath };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function getHookTemplateName(client) {
  switch (client) {
    case 'claude-code': return 'claude-code.json';
    case 'opencode': return 'opencode.json';
    case 'codex': return 'codex.json';
    default: throw new Error(`Unknown hook template for: ${client}`);
  }
}

function getHookSettingsPath(client) {
  switch (client) {
    case 'claude-code':
      return path.join(homeDir, '.claude', 'settings.local.json');
    case 'opencode':
      return path.join(homeDir, '.config', 'opencode', 'opencode.json');
    case 'codex':
      return path.join(homeDir, '.codex', 'config.toml');
    default:
      throw new Error(`Unknown hook settings path for: ${client}`);
  }
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

export function installAll(clients, options = {}) {
  const results = {};

  for (const client of clients) {
    const steps = [];

    // MCP
    const mcpResult = installMCP(client, options);
    steps.push({ type: 'mcp', ...mcpResult });

    // Plugin (if supported)
    if (PLUGIN_CLIENTS.has(client)) {
      const pluginResult = installPlugin(client, options);
      steps.push({ type: 'plugin', ...pluginResult });
    }

    // Hooks (if supported)
    if (HOOK_CLIENTS.has(client)) {
      const hooksResult = installHooks(client, options);
      steps.push({ type: 'hooks', ...hooksResult });
    }

    results[client] = steps;
  }

  return results;
}

export function uninstallAll(clients, options = {}) {
  const results = {};

  for (const client of clients) {
    const steps = [];

    // MCP
    const mcpResult = uninstallMCP(client, options);
    steps.push({ type: 'mcp', ...mcpResult });

    // Plugin (if supported)
    if (PLUGIN_CLIENTS.has(client)) {
      const pluginResult = uninstallPlugin(client, options);
      steps.push({ type: 'plugin', ...pluginResult });
    }

    // Hooks (if supported)
    if (HOOK_CLIENTS.has(client)) {
      const hooksResult = uninstallHooks(client, options);
      steps.push({ type: 'hooks', ...hooksResult });
    }

    results[client] = steps;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Query installed state
// ---------------------------------------------------------------------------

export function getInstalledClients() {
  const manifest = loadManifest();
  return Object.entries(manifest.clients || {}).map(([client, info]) => ({
    client,
    installed: info.installed || [],
  }));
}
