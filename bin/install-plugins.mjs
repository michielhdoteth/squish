#!/usr/bin/env node

/**
 * Squish Plugin Installer
 * Installs Squish plugins for all detected AI agents:
 * - Claude Code (.claude/plugins/)
 * - OpenCode (.opencode/plugins/ or ~/.config/opencode/plugins/)
 * - OpenClaw (~/.openclaw/plugins/ and hooks)
 *
 * Usage:
 *   node install-plugins.mjs [--all] [--clients=claude-code,opencode,openclaw] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pluginDir = path.join(root, 'plugin');

const isWin = platform() === 'win32';

function copyDir(src, dest, options = { dryRun: false }) {
  if (options.dryRun) {
    console.log(`  [DRY RUN] Would copy ${src} -> ${dest}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, options);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function detectClients() {
  const clients = [];

  // Check for Claude Code
  try {
    const result = spawnSync(isWin ? 'where.exe' : 'which', ['claude'], { encoding: 'utf8', timeout: 3000 });
    if (result.status === 0) clients.push('claude-code');
  } catch {}

  // Check for OpenCode
  try {
    const result = spawnSync(isWin ? 'where.exe' : 'which', ['opencode'], { encoding: 'utf8', timeout: 3000 });
    if (result.status === 0) clients.push('opencode');
  } catch {}

  // Check for OpenClaw
  try {
    const result = spawnSync(isWin ? 'where.exe' : 'which', ['openclaw'], { encoding: 'utf8', timeout: 3000 });
    if (result.status === 0) clients.push('openclaw');
  } catch {}

  return clients;
}

function installClaudeCode(options) {
  console.log('\n=== Claude Code Plugin ===');

  const home = homedir();
  const globalPluginDir = path.join(home, '.claude', 'plugins', 'squish-memory');
  const sourcePluginDir = path.join(pluginDir, 'claude-code');

  if (!fs.existsSync(sourcePluginDir)) {
    console.log('  Source plugin directory not found, skipping');
    return;
  }

  if (options.dryRun) {
    console.log(`  Would copy to: ${globalPluginDir}`);
    return;
  }

  // Copy entire plugin directory (structure: .claude-plugin/, skills/, hooks/, .mcp.json, scripts/)
  copyDir(sourcePluginDir, globalPluginDir, options);
  console.log(`  Installed to: ${globalPluginDir}`);
  console.log('  Components: skill (squish-memory), hooks (SessionStart, Stop), MCP server (squish)');

  // Update global Claude Code config to enable the plugin
  const configPath = path.join(home, '.claude', 'settings.json');
  const config = readJson(configPath) || {};
  if (!config.plugins) config.plugins = [];
  if (!config.plugins.includes('squish-memory')) {
    config.plugins.push('squish-memory');
    writeJson(configPath, config);
    console.log('  Added to Claude Code plugins list');
  } else {
    console.log('  Already in plugins list');
  }
}

function installOpenCode(options) {
  console.log('\n=== OpenCode Plugin ===');

  const home = homedir();
  // Try project-level first, then global
  const projectPluginDir = path.join(process.cwd(), '.opencode', 'plugins', 'squish-memory');
  const globalPluginDir = path.join(home, '.config', 'opencode', 'plugins', 'squish-memory');
  const sourcePluginDir = path.join(pluginDir, 'opencode');

  if (!fs.existsSync(sourcePluginDir)) {
    console.log('  Source plugin directory not found, skipping');
    return;
  }

  // Prefer project-level install
  const targetDir = fs.existsSync(path.join(process.cwd(), '.opencode'))
    ? projectPluginDir
    : globalPluginDir;

  if (options.dryRun) {
    console.log(`  Would copy to: ${targetDir}`);
    return;
  }

  copyDir(sourcePluginDir, targetDir, options);
  console.log(`  Installed to: ${targetDir}`);

  // Update opencode.json to include the plugin
  const projectConfigPath = path.join(process.cwd(), '.opencode', 'opencode.json');
  const globalConfigPath = path.join(home, '.config', 'opencode', 'opencode.json');
  const configPath = fs.existsSync(projectConfigPath) ? projectConfigPath : globalConfigPath;

  if (configPath) {
    const config = readJson(configPath) || {};
    if (!config.plugins) config.plugins = [];
    const pluginPath = path.relative(path.dirname(configPath), targetDir);
    if (!config.plugins.includes(pluginPath)) {
      config.plugins.push(pluginPath);
      writeJson(configPath, config);
      console.log(`  Added to plugins in ${configPath}`);
    } else {
      console.log('  Already in plugins list');
    }
  }
}

function installOpenClaw(options) {
  console.log('\n=== OpenClaw Plugin ===');

  const home = homedir();
  const pluginTargetDir = path.join(home, '.openclaw', 'plugins', 'squish-memory');
  const sourcePluginDir = path.join(pluginDir, 'openclaw');

  if (options.dryRun) {
    console.log(`  Would copy plugin to: ${pluginTargetDir}`);
    return;
  }

  // Install plugin (includes openclaw.plugin.json, package.json, dist/index.js)
  if (fs.existsSync(sourcePluginDir)) {
    copyDir(sourcePluginDir, pluginTargetDir, options);
    console.log(`  Plugin installed to: ${pluginTargetDir}`);
  }

  // Update OpenClaw config
  const configPath = path.join(home, '.openclaw', 'config.json');
  const config = readJson(configPath) || {};

  // Enable plugin
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  if (!config.plugins.entries['squish-memory']) {
    config.plugins.entries['squish-memory'] = { enabled: true };
    writeJson(configPath, config);
    console.log('  Plugin enabled in OpenClaw config');
  } else {
    console.log('  Already enabled in config');
  }

  console.log('  Note: Run `openclaw gateway restart` to activate');
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    clients: [],
    dryRun: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--clients=')) {
      options.clients = arg.split('=')[1].split(',');
    }
  }

  return options;
}

function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
Squish Plugin Installer

Usage:
  node install-plugins.mjs [options]

Options:
  --all                  Install for all detected agents
  --clients=<list>       Install for specific agents (comma-separated)
                         Supported: claude-code, opencode, openclaw
  --dry-run              Preview installation without making changes
  --help, -h             Show this help message

Examples:
  node install-plugins.mjs --all
  node install-plugins.mjs --clients=claude-code,opencode
  node install-plugins.mjs --dry-run
`);
    process.exit(0);
  }

  const detected = detectClients();
  let targets = options.clients.length > 0 ? options.clients : (options.all ? detected : []);

  if (targets.length === 0) {
    console.log('No agents detected. Use --all to force install, or --clients=claude-code,opencode,openclaw');
    console.log('Detected agents:', detected.length > 0 ? detected.join(', ') : 'none');
    process.exit(0);
  }

  console.log('Squish Plugin Installer v1.5.0');
  console.log('Installing for:', targets.join(', '));
  if (options.dryRun) console.log('(DRY RUN - no changes will be made)');

  for (const client of targets) {
    switch (client) {
      case 'claude-code':
        installClaudeCode(options);
        break;
      case 'opencode':
        installOpenCode(options);
        break;
      case 'openclaw':
        installOpenClaw(options);
        break;
      default:
        console.log(`\nUnknown client: ${client}`);
    }
  }

  console.log('\nDone!');
}

main();
