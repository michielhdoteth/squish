#!/usr/bin/env node
/**
 * Hook Installer - Injects Squish hooks into IDE settings
 * 
 * Installs hook configurations into:
 * - Claude Code: ~/.claude/settings.local.json
 * - OpenCode: ~/.config/opencode/opencode.json
 * - Codex: ~/.codex/hooks.json
 * - Cursor: ~/.cursor/settings.json
 * - Windsurf: ~/.windsurf/settings.json
 * 
 * Usage:
 *   node hook-installer.mjs --client=claude-code
 *   node hook-installer.mjs --all
 *   node hook-installer.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
const pluginDir = path.join(root, 'plugin');
const templatesDir = path.join(pluginDir, 'templates', 'hooks');

// Client settings paths
const CLIENT_SETTINGS = {
  'claude-code': {
    dir: path.join(os.homedir(), '.claude'),
    file: 'settings.local.json',
    hooksKey: 'hooks',
    template: 'claude-code.json'
  },
  'opencode': {
    dir: path.join(os.homedir(), '.config', 'opencode'),
    file: 'opencode.json',
    hooksKey: 'hooks',
    template: 'opencode.json'
  },
  'codex': {
    dir: path.join(os.homedir(), '.codex'),
    file: 'hooks.json',
    hooksKey: null, // Top-level is the hooks array
    template: 'codex.json'
  },
  'cursor': {
    dir: path.join(os.homedir(), '.cursor'),
    file: 'settings.json',
    hooksKey: 'hooks',
    template: 'opencode.json' // Same as OpenCode
  },
  'windsurf': {
    dir: path.join(os.homedir(), '.windsurf'),
    file: 'settings.json',
    hooksKey: 'hooks',
    template: 'opencode.json' // Same as OpenCode
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { clients: [], all: false, dryRun: false, help: false };
  
  for (const arg of args) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--client=')) opts.clients.push(arg.replace('--client=', ''));
    else if (arg.startsWith('--')) continue; // Skip unknown flags
    else if (CLIENT_SETTINGS[arg]) opts.clients.push(arg);
  }
  
  return opts;
}

function printHelp() {
  console.log(`
Squish Hook Installer
=================

Usage:
  node hook-installer.mjs --client=<name>    Install hooks for specific client
  node hook-installer.mjs --all                Install for all supported clients
  node hook-installer.mjs --dry-run           Preview without installing

Supported clients:
  claude-code, opencode, codex, cursor, windsurf

Examples:
  node hook-installer.mjs --client=claude-code
  node hook-installer.mjs --all --dry-run
`);
}

function loadTemplate(templateName) {
  const templatePath = path.join(templatesDir, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }
  return JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
}

function substituteHookDir(template, hookDir) {
  const json = JSON.stringify(template);
  return json.replace(/\{\{HOOK_DIR\}\}/g, hookDir.replace(/\\/g, '/'));
}

function installHooksForClient(clientName, options) {
  const client = CLIENT_SETTINGS[clientName];
  if (!client) {
    console.log(`  Unknown client: ${clientName}`);
    return false;
  }
  
  const settingsPath = path.join(client.dir, client.file);
  const hookDir = path.join(pluginDir, 'scripts');
  
  // Check if settings directory exists
  if (!fs.existsSync(client.dir)) {
    console.log(`  ${clientName} not installed (${client.dir} not found)`);
    return false;
  }
  
  // Load and substitute template
  let template;
  try {
    template = loadTemplate(client.template);
  } catch (e) {
    console.log(`  Template error: ${e.message}`);
    return false;
  }
  
  const hooksConfig = substituteHookDir(template, hookDir);
  
  if (options.dryRun) {
    console.log(`  [dry-run] Would write to: ${settingsPath}`);
    console.log(`  [dry-run] Hooks: ${JSON.stringify(hooksConfig, null, 2)}`);
    return true;
  }
  
  // Read existing settings or create new
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }
  
  // Merge hooks
  const key = client.hooksKey || null;
  if (key) {
    settings[key] = hooksConfig;
  } else {
    // Top-level array (Codex)
    settings = hooksConfig;
  }
  
  // Backup existing
  if (fs.existsSync(settingsPath)) {
    const backup = settingsPath + '.bak';
    fs.copyFileSync(settingsPath, backup);
  }
  
  // Write new settings
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`  Installed hooks for ${clientName}`);
  
  return true;
}

async function main() {
  const opts = parseArgs();
  
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  
  console.log('Squish Hook Installer\n');
  
  if (opts.dryRun) {
    console.log('[dry-run mode]\n');
  }
  
  let clients = opts.clients;
  if (opts.all) {
    clients = Object.keys(CLIENT_SETTINGS);
  }
  
  if (clients.length === 0) {
    console.log('No clients specified. Use --client=<name> or --all');
    printHelp();
    process.exit(1);
  }
  
  let installed = 0;
  for (const client of clients) {
    if (installHooksForClient(client, opts)) {
      installed++;
    }
  }
  
  console.log(`\nInstalled hooks for ${installed} client(s)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
