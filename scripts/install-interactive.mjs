#!/usr/bin/env node

/**
 * Squish MCP Installer
 * Installs Squish MCP configuration for various AI clients
 * Supports: Claude Code, OpenCode, Codex, Cursor, VS Code, Windsurf
 * 
 * Usage:
 *   bun run install              # Interactive wizard
 *   bun run install --all        # Auto-install for all detected clients
 *   bun run install --clients=claude-code,opencode  # Specific clients
 *   bun run install --dry-run    # Preview without installing
 */

import { intro, outro, confirm, multiselect, select, isCancel, cancel, spinner, note } from '@clack/prompts';
import picocolors from 'picocolors';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "config", "plugin-manifest.json");

const c = picocolors;

const icons = {
  squish: "🐙",
  check: "✓",
  cross: "✗",
  arrow: "→",
  dot: "●",
  mcp: "🔌",
  settings: "⚙️"
};

// Client config file locations
const CLIENT_CONFIGS = {
  "claude-code": { dir: path.join(os.homedir(), ".claude"), file: "mcp.json" },
  opencode: { dir: path.join(os.homedir(), ".config", "opencode"), file: "mcp-servers.json" },
  codex: { dir: path.join(os.homedir(), ".codex"), file: "mcp-servers.json" },
  cursor: { dir: path.join(os.homedir(), ".cursor"), file: "mcp.json" },
  vscode: { dir: path.join(os.homedir(), ".vscode", "mcp"), file: "servers.json" },
  windsurf: { dir: path.join(os.homedir(), ".windsurf"), file: "mcp-servers.json" }
};

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
      options.clients = arg.slice(10).split(',').map(c => c.trim());
    }
  }

  return options;
}

function printHelp() {
  printLogo();
  console.log(c.white("Usage:"));
  console.log(`  ${c.cyan("bun run install")}              # Interactive wizard`);
  console.log(`  ${c.cyan("bun run install --all")}         # Auto-install for all detected clients`);
  console.log(`  ${c.cyan("bun run install --clients=claude-code,opencode")}  # Specific clients`);
  console.log(`  ${c.cyan("bun run install --dry-run")}    # Preview without installing\n`);
  console.log(c.white("Options:"));
  console.log(`  ${c.cyan("--all")}         Install for all supported clients`);
  console.log(`  ${c.cyan("--clients=")}    Comma-separated list of clients`);
  console.log(`  ${c.cyan("--dry-run")}    Preview changes without installing`);
  console.log(`  ${c.cyan("--help")}       Show this help message\n`);
  console.log(c.white("Supported clients:"));
  console.log(`  claude-code, opencode, codex, cursor, vscode, windsurf`);
}

function printLogo() {
  console.log(c.cyan(`
██████╗ ██████╗ ██╗   ██╗██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██║██╔════╝██║  ██║
██████╗██║   ██║██║   ██║██║███████╗███████║
╚════██║██║   ██║██║   ██║██║╚════██║██╔══██║
██████║╚██████╔╝╚██████╔╝██║███████║██║  ██║
╚═════╝ ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝
  `));
  console.log(c.gray("   Universal Memory System for AI Agents\n"));
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function detectClients() {
  const detected = {};
  for (const [client, config] of Object.entries(CLIENT_CONFIGS)) {
    const configPath = path.join(config.dir, config.file);
    detected[client] = fs.existsSync(config.dir);
  }
  return detected;
}

function expandPath(filePath) {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    console.log(c.gray(`  Backed up: ${backupPath}`));
  }
}

// Generate MCP config for each client format
function generateMCPConfig(client, manifest) {
  const target = manifest.targets[client];
  if (!target) return null;

  // OpenCode format: { "server-name": { type, command, enabled } }
  if (target.format === "opencode") {
    return {
      [target.serverName]: {
        type: target.type === "local" ? "local" : "stdio",
        command: Array.isArray(target.command) ? target.command : [target.command],
        enabled: target.enabled !== false
      }
    };
  }

  // Standard MCP format: { mcpServers: { "server-name": { type, command, args, env } } }
  return {
    mcpServers: {
      [target.serverName]: {
        command: target.command,
        args: target.args || ["--stdio"],
        env: target.env || {}
      }
    }
  };
}

// Merge MCP config with existing config
function mergeMCPConfig(client, manifest, options = {}) {
  const target = manifest.targets[client];
  if (!target) return { error: `Unknown client: ${client}` };

  const configInfo = CLIENT_CONFIGS[client];
  const configPath = expandPath(path.join(configInfo.dir, configInfo.file));

  // Generate new config
  const newConfig = generateMCPConfig(client, manifest);
  if (!newConfig) return { error: "Failed to generate config" };

  ensureDir(configInfo.dir);

  let existingConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      existingConfig = {};
    }
  }

  // Merge based on format
  let merged;
  if (target.format === "opencode") {
    // OpenCode format: merge at root level
    merged = { ...existingConfig, ...newConfig };
  } else {
    // Standard format: merge under mcpServers
    merged = { ...existingConfig };
    if (!merged.mcpServers) merged.mcpServers = {};
    merged.mcpServers = { ...merged.mcpServers, ...newConfig.mcpServers };
  }

  // Write config
  if (!options.dryRun) {
    backupFile(configPath);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  }

  return { ok: true, configPath, merged };
}

function getClientChoices(manifest, detected) {
  if (!manifest || !manifest.targets) return [];

  const clientNames = {
    "claude-code": "Claude Code",
    opencode: "OpenCode",
    codex: "Codex",
    cursor: "Cursor",
    vscode: "VS Code",
    windsurf: "Windsurf"
  };

  return Object.keys(manifest.targets).map(client => {
    const isInstalled = detected[client];
    const name = clientNames[client] || client;
    let label = name;
    if (isInstalled) label += ` ${c.green(icons.check)}`;
    return {
      value: client,
      label: label,
      hint: isInstalled ? "Config found" : "Not detected"
    };
  });
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const manifest = loadManifest();
  if (!manifest) {
    console.log(c.red("Error: Plugin manifest not found"));
    process.exit(1);
  }

  const detected = detectClients();
  const choices = getClientChoices(manifest, detected);

  let clients;

  // Non-interactive mode
  if (opts.all) {
    // Install for all supported clients
    clients = choices.map(c => c.value);
    printLogo();
    console.log(c.cyan(`Auto-installing for all ${clients.length} clients...\n`));
  } else if (opts.clients.length > 0) {
    // Install for specific clients
    clients = opts.clients;
    printLogo();
    console.log(c.cyan(`Installing for: ${clients.join(', ')}\n`));
  } else if (process.stdin.isTTY) {
    // Interactive mode
    printLogo();
    intro(c.cyan(`${icons.squish} Squish MCP Installer`));

    // Select clients to install
    clients = await multiselect({
      message: 'Which AI agents do you want to install Squish MCP for?',
      options: choices,
      required: false
    });

    if (isCancel(clients) || !clients || clients.length === 0) {
      console.log(c.yellow("No clients selected. Exiting."));
      process.exit(0);
    }
  } else {
    // Non-interactive without flags - show help
    printHelp();
    process.exit(0);
  }

  // Dry run mode
  if (opts.dryRun) {
    console.log(c.yellow("\n--- DRY RUN MODE ---\n"));
    for (const client of clients) {
      const configInfo = CLIENT_CONFIGS[client];
      console.log(`  Would install for ${client}:`);
      console.log(`    Config: ${configInfo.dir}/${configInfo.file}`);
    }
    console.log("");
    process.exit(0);
  }

  // Non-interactive: skip review/confirm
  const isInteractive = opts.all || opts.clients.length === 0 && process.stdin.isTTY;
  
  if (isInteractive) {
    // Review
    let summary = `${c.white("Installation Summary:")}\n\n`;
    summary += `${c.cyan("Installing Squish MCP for:")}\n`;
    clients.forEach(client => {
      const configInfo = CLIENT_CONFIGS[client];
      summary += `  ${icons.check} ${client}\n`;
      summary += `     ${c.gray(configInfo.dir)}\n`;
    });

    note(summary, 'Review');

    const shouldInstall = await confirm({
      message: 'Proceed with installation?',
      initialValue: true
    });

    if (isCancel(shouldInstall) || !shouldInstall) {
      console.log(c.yellow("Installation cancelled"));
      process.exit(0);
    }
  }

  // Install
  const s = spinner();
  s.start('Installing MCP configurations...');

  const results = [];
  for (const client of clients) {
    const result = mergeMCPConfig(client, manifest);
    results.push({ client, ...result });
  }

  const errors = results.filter(r => r.error);
  const success = results.filter(r => r.ok);

  if (errors.length > 0) {
    s.stop(c.red(`${icons.cross} Some installations failed`));
    errors.forEach(e => console.log(c.red(`  ${e.client}: ${e.error}`)));
  } else {
    s.stop(c.green(`${icons.check} Installed for ${success.length} client(s)`));
  }

  // Next steps
  console.log();
  console.log(c.white("What's next?"));
  console.log(`  ${c.cyan(icons.arrow)} Restart your AI assistant(s)`);
  console.log(`  ${c.cyan(icons.arrow)} Try: squish remember "Your first memory"`);
  console.log();

  outro(c.green(`${icons.check} Installation Complete!`));
}

main().catch((err) => {
  console.log(c.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
