#!/usr/bin/env node

/**
 * Squish MCP Installer (using add-mcp)
 * Installs Squish MCP configuration for various AI clients
 * Supports: Claude Code, OpenCode, Codex, Cursor, VS Code, Windsurf, and more via add-mcp
 * 
 * Usage:
 *   bun run install              # Interactive wizard
 *   bun run install --all        # Auto-install for all detected clients
 *   bun run install --clients=claude-code,opencode  # Specific clients
 *   bun run install --global      # Install globally (user-level)
 *   bun run install --dry-run    # Preview without installing
 */

import { intro, outro, confirm, multiselect, isCancel, spinner, note } from '@clack/prompts';
import picocolors from 'picocolors';
import { spawn } from 'child_process';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

const c = picocolors;

const icons = {
  squish: "🐙",
  check: "✓",
  cross: "✗",
  arrow: "→",
  mcp: "🔌"
};

// add-mcp supported agents (for reference - add-mcp auto-detects)
const ADD_MCP_AGENTS = [
  'claude-code',
  'opencode', 
  'codex',
  'cursor',
  'vscode',
  'claude-desktop',
  'gemini-cli',
  'goose',
  'zed'
];

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    global: false,
    clients: [],
    dryRun: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--global' || arg === '-g') options.global = true;
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
  console.log(`  ${c.cyan("bun run install --global")}      # Install globally (user-level)`);
  console.log(`  ${c.cyan("bun run install --clients=claude-code,opencode")}  # Specific clients`);
  console.log(`  ${c.cyan("bun run install --dry-run")}    # Preview without installing\n`);
  console.log(c.white("Options:"));
  console.log(`  ${c.cyan("--all")}         Install for all supported clients`);
  console.log(`  ${c.cyan("--global")}      Install globally (user-level instead of project)`);
  console.log(`  ${c.cyan("--clients=")}    Comma-separated list of clients`);
  console.log(`  ${c.cyan("--dry-run")}    Preview changes without installing`);
  console.log(`  ${c.cyan("--help")}       Show this help message\n`);
  console.log(c.white("Supported clients:"));
  console.log(`  claude-code, opencode, codex, cursor, vscode, windsurf, and more`);
  console.log(c.white("\nAlso works directly:"));
  console.log(`  ${c.cyan("npx add-mcp squish-memory")}    # Install via add-mcp directly`);
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

// Detect which add-mcp agents are available on this system
function detectAvailableAgents() {
  const agents = [];
  
  // Check common client directories
  const checks = [
    { dir: path.join(os.homedir(), '.claude'), agent: 'claude-code' },
    { dir: path.join(os.homedir(), '.config', 'opencode'), agent: 'opencode' },
    { dir: path.join(os.homedir(), '.codex'), agent: 'codex' },
    { dir: path.join(os.homedir(), '.cursor'), agent: 'cursor' },
    { dir: path.join(os.homedir(), '.vscode'), agent: 'vscode' },
    { dir: path.join(os.homedir(), '.windsurf'), agent: 'windsurf' },
    { dir: path.join(os.homedir(), '.zed'), agent: 'zed' },
    { dir: path.join(os.homedir(), '.gemini'), agent: 'gemini-cli' },
  ];

  for (const check of checks) {
    if (fs.existsSync(check.dir)) {
      agents.push(check.agent);
    }
  }

  return agents;
}

// Get client display name
function getClientName(agent) {
  const names = {
    'claude-code': 'Claude Code',
    'opencode': 'OpenCode',
    'codex': 'Codex',
    'cursor': 'Cursor',
    'vscode': 'VS Code',
    'windsurf': 'Windsurf',
    'zed': 'Zed',
    'gemini-cli': 'Gemini CLI',
    'claude-desktop': 'Claude Desktop',
    'goose': 'Goose'
  };
  return names[agent] || agent;
}

// Check if squish-memory package exists locally
function checkPackageExists() {
  // Check if package.json exists in root
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    // Check if squish-memory is in dependencies or devDependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return !!deps['squish-memory'];
  } catch {
    return false;
  }
}

// Run add-mcp command
function runAddMcp(clients, options) {
  return new Promise((resolve, reject) => {
    // Try squish-memory first (published name), fallback to @squish/memory
    // add-mcp will find the correct package
    const packageName = 'squish-memory';
    const args = ['add-mcp', packageName, '-y'];
    
    // Add specific agents
    if (clients && clients.length > 0) {
      for (const client of clients) {
        args.push('-a', client);
      }
    }
    
    // Add global flag if requested
    if (options.global) {
      args.push('--global');
    }
    
    console.log(c.cyan(`Running: npx ${args.join(' ')}\n`));
    
    const child = spawn('npx', args, {
      stdio: 'inherit',
      cwd: root,
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`add-mcp exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// Interactive client selection
async function selectClients(availableAgents) {
  const options = availableAgents.map(agent => ({
    value: agent,
    label: getClientName(agent),
    hint: 'Detected on system'
  }));

  if (options.length === 0) {
    console.log(c.yellow("No AI clients detected. Installing globally...\n"));
    return null;
  }

  const selected = await multiselect({
    message: 'Which AI agents do you want to install Squish MCP for?',
    options,
    required: false
  });

  return selected;
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // Dry run mode - check first before any other logic
  if (opts.dryRun) {
    console.log(c.yellow("\n--- DRY RUN MODE ---\n"));
    console.log(`Would run: npx add-mcp squish-memory -y`);
    if (opts.global) {
      console.log("  (--global) Install globally");
    }
    if (opts.clients && opts.clients.length > 0) {
      console.log(`  (--agents) ${opts.clients.join(', ')}`);
    } else {
      console.log("  (auto-detect) Let add-mcp detect installed agents");
    }
    console.log("");
    process.exit(0);
  }

  printLogo();
  console.log(c.gray("Using add-mcp for universal MCP installation\n"));

  // Detect available agents
  const availableAgents = detectAvailableAgents();
  
  let clients;
  
  // Non-interactive mode
  if (opts.all) {
    // Install for all available agents (or all known if none detected)
    clients = availableAgents.length > 0 ? availableAgents : ADD_MCP_AGENTS;
    console.log(c.cyan(`Auto-installing for ${clients.length} clients...\n`));
  } else if (opts.clients.length > 0) {
    // Install for specific clients
    clients = opts.clients;
    console.log(c.cyan(`Installing for: ${clients.join(', ')}\n`));
  } else if (process.stdin.isTTY) {
    // Interactive mode
    intro(c.cyan(`${icons.squish} Squish MCP Installer`));
    
    clients = await selectClients(availableAgents);
    
    if (isCancel(clients) || !clients || clients.length === 0) {
      console.log(c.yellow("No clients selected. Using add-mcp auto-detection...\n"));
      clients = null; // Let add-mcp auto-detect
    }
  } else {
    // Non-interactive without flags - show help
    printHelp();
    process.exit(0);
  }

  // Install
  const s = spinner();
  s.start('Installing Squish MCP via add-mcp...');

  try {
    await runAddMcp(clients, opts);
    s.stop(c.green(`${icons.check} Installation Complete!`));
  } catch (error) {
    s.stop(c.red(`${icons.cross} Installation failed`));
    console.log(c.red(`Error: ${error.message}`));
    console.log(c.gray("\nTrying alternative: npx add-mcp squish-memory -y"));
    
    // Fallback: try without specific agents (let add-mcp auto-detect)
    try {
      await runAddMcp(null, opts);
      s.stop(c.green(`${icons.check} Installation complete (fallback)!`));
    } catch (fallbackError) {
      console.log(c.red(`Fallback also failed: ${fallbackError.message}`));
      process.exit(1);
    }
  }

  // Next steps
  console.log();
  console.log(c.white("What's next?"));
  console.log(`  ${c.cyan(icons.arrow)} Restart your AI assistant(s)`);
  console.log(`  ${c.cyan(icons.arrow)} Try: squish remember "Your first memory"`);
  console.log(`  ${c.cyan(icons.arrow)} Or use: npx add-mcp squish-memory --help`);
  console.log();

  outro(c.green(`${icons.check} Squish MCP installed!`));
}

main().catch((err) => {
  console.log(c.red(`Fatal error: ${err.message}`));
  process.exit(1);
});