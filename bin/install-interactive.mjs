#!/usr/bin/env node

/**
 * Squish MCP Installer
 * Installs Squish MCP configuration for supported AI clients
 * 
 * Usage:
 *   squish install              # Interactive wizard
 *   squish install --all        # Auto-install for all detected clients
 *   squish install --clients=claude-code,opencode  # Specific clients
 *   squish install --global     # Install globally (user-level)
 *   squish install --dry-run    # Preview without installing
 */

import { intro, outro, multiselect, isCancel, spinner } from '@clack/prompts';
import picocolors from 'picocolors';
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenCodeInlineMcpConfig, CLIENT_MCP_TARGETS } from "./install-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, "package.json");

const c = picocolors;

const icons = {
  squish: "🐙",
  check: "✓",
  cross: "✗",
  arrow: "→",
  mcp: "🔌"
};

const SUPPORTED_AGENTS = [
  'claude-code',
  'opencode', 
  'codex',
  'openclaw'
];

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

function getShadowedRuntimeIssue() {
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
  console.log(`  ${c.cyan("squish install")}              # Interactive wizard`);
  console.log(`  ${c.cyan("squish install --all")}         # Auto-install for all detected clients`);
  console.log(`  ${c.cyan("squish install --global")}      # Install globally (user-level)`);
  console.log(`  ${c.cyan("squish install --clients=claude-code,opencode")}  # Specific clients`);
  console.log(`  ${c.cyan("squish install --dry-run")}    # Preview without installing\n`);
  console.log(c.white("Options:"));
  console.log(`  ${c.cyan("--all")}         Install for all supported clients`);
  console.log(`  ${c.cyan("--global")}      Install globally (user-level instead of project)`);
  console.log(`  ${c.cyan("--clients=")}    Comma-separated list of clients`);
  console.log(`  ${c.cyan("--dry-run")}    Preview changes without installing`);
  console.log(`  ${c.cyan("--help")}       Show this help message\n`);
  console.log(c.white("Supported clients:"));
  console.log(`  claude-code, opencode, codex, openclaw`);
  console.log(c.white("\nThis installer writes explicit MCP configs for those clients."));
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
    { dir: path.join(os.homedir(), '.openclaw'), agent: 'openclaw' },
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

function installMcpConfigs(clients, options) {
  const selectedClients = clients?.length ? clients : SUPPORTED_AGENTS;
  const results = [];

  for (const client of selectedClients) {
    const target = CLIENT_MCP_TARGETS[client];
    if (!target) {
      results.push({ client, ok: false, error: `Unsupported client: ${client}` });
      continue;
    }

    try {
      const result = target.install(options.dryRun);
      results.push({ client, ok: true, ...result });
    } catch (error) {
      results.push({
        client,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
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

  const shadowedIssues = getShadowedRuntimeIssue();
  if (shadowedIssues.length > 0) {
    console.error(c.red("Stale Bun global install is shadowing the current Squish binary.\n"));
    for (const issue of shadowedIssues) {
      console.error(c.red(`- ${issue.command}: ${issue.first}`));
      console.error(c.yellow(`  alternates: ${issue.alternates.join(', ')}`));
    }
    console.error("");
    console.error(c.white("Fix:"));
    console.error(`  ${c.cyan("bun uninstall -g squish-memory")}`);
    console.error(`  ${c.cyan("Restart your shell and rerun `where squish` / `where squish-mcp`")}`);
    console.error(`  ${c.cyan("Or move your npm/yarn global bin ahead of ~/.bun/bin on PATH")}`);
    process.exit(1);
  }

  // Dry run mode - check first before any other logic
  if (opts.dryRun) {
    console.log(c.yellow("\n--- DRY RUN MODE ---\n"));
    const dryRunClients = opts.clients.length > 0 ? opts.clients : SUPPORTED_AGENTS;
    for (const client of dryRunClients) {
      const target = CLIENT_MCP_TARGETS[client];
      if (!target) {
        console.log(`Unsupported client: ${client}`);
        continue;
      }
      const preview = target.install(true);
      console.log(`${client}: ${preview.path}`);
    }
    console.log("");
    process.exit(0);
  }

  printLogo();
  console.log(c.gray("Writing explicit MCP configuration for supported clients\n"));

  // Detect available agents
  const availableAgents = detectAvailableAgents();
  
  let clients;
  
  // Non-interactive mode
  if (opts.all) {
    clients = availableAgents.length > 0 ? availableAgents.filter((client) => CLIENT_MCP_TARGETS[client]) : SUPPORTED_AGENTS;
    console.log(c.cyan(`Auto-installing for ${clients.length} clients...\n`));
  } else if (opts.clients.length > 0) {
    clients = opts.clients;
    console.log(c.cyan(`Installing for: ${clients.join(', ')}\n`));
  } else if (process.stdin.isTTY) {
    intro(c.cyan(`${icons.squish} Squish MCP Installer`));
    
    clients = await selectClients(availableAgents);
    
    if (isCancel(clients) || !clients || clients.length === 0) {
      console.log(c.yellow("No clients selected. Installing supported defaults...\n"));
      clients = SUPPORTED_AGENTS;
    }
  } else {
    printHelp();
    process.exit(0);
  }

  const s = spinner();
  s.start('Installing Squish MCP configs...');

  const installResults = installMcpConfigs(clients, opts);
  const failures = installResults.filter((result) => !result.ok);
  const successes = installResults.filter((result) => result.ok);

  if (failures.length > 0) {
    s.stop(c.red(`${icons.cross} MCP config install had failures`));
    for (const failure of failures) {
      console.log(c.red(`  ${failure.client}: ${failure.error}`));
    }
    if (successes.length === 0) {
      process.exit(1);
    }
  } else {
    s.stop(c.green(`${icons.check} MCP config installation complete!`));
  }

  for (const success of successes) {
    console.log(c.green(`  ✓ ${success.client} MCP config -> ${success.path}`));
  }

  // Next steps
  console.log();
  console.log(c.white("What's next?"));
  console.log(`  ${c.cyan(icons.arrow)} Restart your AI assistant(s)`);
  console.log(`  ${c.cyan(icons.arrow)} Verify the MCP server directly: squish-mcp --health`);
  console.log(`  ${c.cyan(icons.arrow)} Try: squish remember "Your first memory"`);

  // Install auto-save hooks after MCP
  console.log(c.cyan("\nInstalling Squish plugins..."));
  
  // Install plugins for detected clients
  const pluginClients = clients || ['claude-code', 'opencode', 'openclaw'];
  
  for (const client of pluginClients) {
    try {
      if (client === 'claude-code') {
        // Install Claude Code plugin (full directory: .claude-plugin/, skills/, hooks/, .mcp.json, scripts/)
        const claudePluginDir = path.join(root, 'plugin', 'claude-code');
        const targetDir = path.join(os.homedir(), '.claude', 'plugins', 'squish-memory');

        if (fs.existsSync(claudePluginDir)) {
          try {
            fs.cpSync(claudePluginDir, targetDir, { recursive: true });
            console.log(c.green(`  ✓ Installed Claude Code plugin to ${targetDir}`));

            // Update Claude Code config to enable the plugin
            const configPath = path.join(os.homedir(), '.claude', 'settings.json');
            let config = {};
            if (fs.existsSync(configPath)) {
              config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            }
            if (!config.plugins) config.plugins = [];
            if (!config.plugins.includes('squish-memory')) {
              config.plugins.push('squish-memory');
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
              console.log(c.green(`  ✓ Enabled squish-memory in Claude Code config`));
            }
          } catch (e) {
            console.log(c.yellow(`  ⚠ Claude Code plugin install failed: ${e.message}`));
          }
        }
      }
      
      if (client === 'opencode') {
        // Install OpenCode plugin
        const opencodePluginDir = path.join(root, 'plugin', 'opencode');
        const targetDir = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'squish-memory');

        // Copy entire plugin directory
        if (fs.existsSync(opencodePluginDir)) {
          try {
            fs.cpSync(opencodePluginDir, targetDir, { recursive: true });
            console.log(c.green(`  ✓ Installed OpenCode plugin to ${targetDir}`));
          } catch (e) {
            console.log(c.yellow(`  ⚠ OpenCode plugin copy failed: ${e.message}`));
          }
        }

        // Update the active OpenCode config in place so stale Bun/npx MCP entries are replaced.
        const configSrc = path.join(opencodePluginDir, 'opencode.json');
        const homeDir = os.homedir();
        const globalConfig = path.join(homeDir, '.config', 'opencode', 'opencode.json');

        if (fs.existsSync(configSrc)) {
          try {
            let existing = {};
            if (fs.existsSync(globalConfig)) {
              existing = JSON.parse(fs.readFileSync(globalConfig, 'utf-8'));
            }
            const pluginConfig = JSON.parse(fs.readFileSync(configSrc, 'utf-8'));
            const merged = { ...existing, ...pluginConfig };
            if (!merged.mcp) merged.mcp = {};
            merged.mcp['squish-memory'] = buildOpenCodeInlineMcpConfig();
            const pluginEntry = targetDir.replace(/\\/g, '/');
            const existingPlugins = Array.isArray(merged.plugin) ? merged.plugin : [];
            merged.plugin = Array.from(new Set([...existingPlugins, pluginEntry]));
            if (merged.plugins) delete merged.plugins;
            fs.writeFileSync(globalConfig, JSON.stringify(merged, null, 2));
            console.log(c.green(`  ✓ Updated OpenCode MCP + plugin config`));
          } catch (e) {
            console.log(c.yellow(`  ⚠ Config update failed: ${e.message}`));
          }
        }
      }
      
      if (client === 'openclaw') {
        // Install OpenClaw plugin (full directory)
        const openclawPluginDir = path.join(root, 'plugin', 'openclaw');
        const targetDir = path.join(os.homedir(), '.openclaw', 'plugins', 'squish-memory');

        try {
          fs.cpSync(openclawPluginDir, targetDir, { recursive: true });

          console.log(c.green(`  ✓ Installed OpenClaw plugin to ${targetDir}`));

          // Update OpenClaw config to enable plugin
          const configPath = path.join(os.homedir(), '.openclaw', 'config.json');
          let config = {};
          if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          }

          if (!config.plugins) config.plugins = {};
          if (!config.plugins.entries) config.plugins.entries = {};
          config.plugins.entries['squish-memory'] = { enabled: true };

          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          console.log(c.green(`  ✓ Enabled squish-memory in OpenClaw config`));
          console.log(c.dim(`  Note: Run 'openclaw gateway restart' to activate`));
        } catch (e) {
          console.log(c.yellow(`  ⚠ OpenClaw plugin install failed: ${e.message}`));
        }
      }
      
    } catch (e) {
      console.log(c.yellow(`  ⚠ ${client} plugin error: ${e.message}`));
    }
  }

  console.log();

  outro(c.green(`${icons.check} Squish MCP installed!`));
}

main().catch((err) => {
  console.log(c.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
