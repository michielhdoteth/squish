#!/usr/bin/env node

/**
 * Squish Interactive Plugin Installer
 * Beautiful terminal UI with Enquirer
 */

import pkg from 'enquirer';
const { MultiSelect } = pkg;
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "config", "plugin-manifest.json");

const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m"
};

const icons = {
  squish: "🐙",
  check: "✓",
  cross: "✗",
  package: "📦",
  arrow: "→",
  dot: "●",
  circle: "○"
};

const CLIENT_DIRS = {
  "claude-code": path.join(os.homedir(), ".claude"),
  opencode: path.join(os.homedir(), ".config", "opencode"),
  codex: path.join(os.homedir(), ".codex"),
  cursor: path.join(os.homedir(), ".cursor"),
  vscode: path.join(os.homedir(), ".vscode", "mcp"),
  windsurf: path.join(os.homedir(), ".windsurf"),
  openclaw: path.join(os.homedir(), ".openclaw")
};

const PLUGINS_DIR = path.join(root, "packages");

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

function detectInstalledClients() {
  const installed = {};
  for (const [client, dir] of Object.entries(CLIENT_DIRS)) {
    try {
      installed[client] = fs.existsSync(dir);
    } catch {
      installed[client] = false;
    }
  }
  return installed;
}

function checkPluginSource(pluginId) {
  const pluginDirs = {
    "claude-code": path.join(PLUGINS_DIR, "plugin-claude-code"),
    "openclaw": path.join(PLUGINS_DIR, "plugin-openclaw"),
    "opencode": path.join(PLUGINS_DIR, "plugin-opencode"),
    "mcp": path.join(PLUGINS_DIR, "plugin-mcp")
  };
  
  const pluginDir = pluginDirs[pluginId];
  if (!pluginDir) return false;
  
  return fs.existsSync(pluginDir) && fs.existsSync(path.join(pluginDir, "package.json"));
}

function shouldUseNonInteractive() {
  return process.env.CI === 'true' ||
         process.env.NON_INTERACTIVE === '1' ||
         process.env.AUTOMATION === 'true' ||
         !process.stdin.isTTY;
}

function parseArgs(argv) {
  const flags = {
    auto: false,
    select: [],
    all: false,
    list: false,
    dryRun: false,
    help: false,
    verbose: false
  };
  
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    
    if (token === "--auto" || token === "-a") {
      flags.auto = true;
    } else if (token === "--all") {
      flags.all = true;
    } else if (token === "--list" || token === "-l") {
      flags.list = true;
    } else if (token === "--dry-run" || token === "-n") {
      flags.dryRun = true;
    } else if (token === "--verbose" || token === "-v") {
      flags.verbose = true;
    } else if (token === "--help" || token === "-h") {
      flags.help = true;
    } else if (token.startsWith("--select=")) {
      flags.select = token.slice(9).split(",").map(s => s.trim());
    } else if (token === "--select") {
      flags.select = [argv[i + 1]];
      i++;
    } else {
      console.log(`${colors.red}Unknown flag: ${token}${colors.reset}`);
      console.log(`Run ${colors.cyan}--help${colors.reset} for usage information`);
      process.exit(1);
    }
  }
  
  return flags;
}

function printHeader() {
  console.log(`
${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════╗${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${icons.squish} ${colors.white}Squish Plugin Installer${colors.reset}                        ${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.gray}Universal memory system for AI agents${colors.reset}        ${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════╝${colors.reset}
`);
}

function printHelp() {
  printHeader();
  console.log(`${colors.white}USAGE:${colors.reset}
  ${colors.cyan}bun run install:interactive${colors.reset} [OPTIONS]

${colors.white}OPTIONS:${colors.reset}
  ${colors.cyan}--auto${colors.reset}, ${colors.cyan}-a${colors.reset}        Skip menu, install all available plugins
  ${colors.cyan}--select${colors.reset}=<list>     Pre-select plugins (comma-separated)
  ${colors.cyan}--all${colors.reset}               Install all available plugins
  ${colors.cyan}--list${colors.reset}, ${colors.cyan}-l${colors.reset}        List available plugins and exit
  ${colors.cyan}--dry-run${colors.reset}, ${colors.cyan}-n${colors.reset}      Preview changes without installing
  ${colors.cyan}--verbose${colors.reset}, ${colors.cyan}-v${colors.reset}     Show detailed output
  ${colors.cyan}--help${colors.reset}, ${colors.cyan}-h${colors.reset}       Show this help message

${colors.white}ENVIRONMENT VARIABLES:${colors.reset}
  ${colors.cyan}CI=true${colors.reset}                  Force non-interactive mode
  ${colors.cyan}NON_INTERACTIVE=1${colors.reset}         Force non-interactive mode
  ${colors.cyan}AUTOMATION=true${colors.reset}           Force non-interactive mode

${colors.white}EXAMPLES:${colors.reset}
  # Interactive menu (default)
  ${colors.gray}$} bun run install:interactive${colors.reset}

  # Non-interactive: install all
  ${colors.gray}$} bun run install:interactive --auto${colors.reset}

  # Non-interactive: specific plugins
  ${colors.gray}$} bun run install:interactive --select=claude-code,openclaw${colors.reset}

  # List available plugins
  ${colors.gray}$} bun run install:interactive --list${colors.reset}

${colors.white}INTERACTIVE CONTROLS:${colors.reset}
  ${colors.cyan}[SPACE]${colors.reset} Toggle selection     ${colors.cyan}[↑↓]${colors.reset} Navigate
  ${colors.cyan}[a]${colors.reset} Toggle all           ${colors.cyan}[ENTER]${colors.reset} Install
  ${colors.cyan}[ESC]${colors.reset} Cancel

${colors.gray}────────────────────────────────────────────────────${colors.reset}
${colors.gray}Documentation: https://github.com/michielhdoteth/squish${colors.reset}
`);
}

function listPlugins() {
  const manifest = loadManifest();
  if (!manifest || !manifest.targets) {
    console.log(`${colors.red}Error: Plugin manifest not found${colors.reset}`);
    process.exit(1);
  }
  
  const installed = detectInstalledClients();
  const clientNames = {
    "claude-code": "Claude Code",
    "openclaw": "OpenClaw",
    "opencode": "OpenCode",
    "codex": "Codex",
    "cursor": "Cursor",
    "vscode": "VS Code",
    "windsurf": "Windsurf"
  };
  
  printHeader();
  console.log(`${colors.white}Available Plugins:${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
  console.log();
  
  let i = 1;
  for (const [client, config] of Object.entries(manifest.targets)) {
    const isInstalled = installed[client];
    const hasSource = checkPluginSource(client);
    
    const status = isInstalled 
      ? `${colors.green}${icons.check}${colors.reset} installed`
      : `${colors.yellow}${icons.dot}${colors.reset} not installed`;
    
    const source = hasSource
      ? `${colors.cyan}${icons.package}${colors.reset} source`
      : `${colors.red}${icons.cross}${colors.reset} no source`;
    
    console.log(`  ${i}. ${colors.white}${clientNames[client] || client}${colors.reset}`);
    console.log(`     ${colors.gray}Type:${colors.reset} ${config.type || 'unknown'}`);
    console.log(`     ${status}  ${source}`);
    console.log();
    i++;
  }
  
  console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.gray}Total: ${i - 1} plugins available${colors.reset}`);
}

function getPluginChoices() {
  const manifest = loadManifest();
  if (!manifest || !manifest.targets) {
    return [];
  }
  
  const installed = detectInstalledClients();
  const clientNames = {
    "claude-code": "Claude Code",
    "openclaw": "OpenClaw",
    "opencode": "OpenCode",
    "codex": "Codex",
    "cursor": "Cursor",
    "vscode": "VS Code",
    "windsurf": "Windsurf"
  };
  
  const typeDescriptions = {
    "hooks": "Session hooks for auto-memory",
    "plugin-slot": "Memory slot via MCP bridge",
    "mcp": "MCP server configuration"
  };
  
  return Object.entries(manifest.targets).map(([client, config]) => {
    const isInstalled = installed[client];
    const hasSource = checkPluginSource(client);
    
    const name = clientNames[client] || client;
    const type = typeDescriptions[config.type] || config.type || 'Plugin';
    
    return {
      name: `${name}`,
      value: client,
      hint: `${type}${isInstalled ? ' ✓ installed' : ''}${hasSource ? ' 📦' : ''}`
    };
  });
}

async function interactiveMenu() {
  printHeader();
  
  const choices = getPluginChoices();
  
  if (choices.length === 0) {
    console.log(`${colors.red}No plugins available${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.white}Select plugins to install:${colors.reset}`);
  console.log(`${colors.gray}(SPACE to toggle, ENTER to install)${colors.reset}`);
  console.log();
  
  const prompt = new MultiSelect({
    name: 'plugins',
    message: ' ',
    hint: ' ',
    choices: choices,
    result(names) {
      return this.map(names);
    }
  });
  
  try {
    const result = await prompt.run();
    return Object.keys(result);
  } catch (err) {
    if (err.message === 'canceled') {
      console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
      process.exit(0);
    }
    throw err;
  }
}

async function performInstallation(pluginIds, options = {}) {
  const manifest = loadManifest();
  const clientNames = {
    "claude-code": "Claude Code",
    "openclaw": "OpenClaw",
    "opencode": "OpenCode",
    "codex": "Codex",
    "cursor": "Cursor",
    "vscode": "VS Code",
    "windsurf": "Windsurf"
  };
  
  console.log();
  console.log(`${colors.white}Installing plugins:${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
  
  pluginIds.forEach((id, i) => {
    console.log(`  ${i + 1}. ${clientNames[id] || id}`);
  });
  console.log();
  
  if (options.dryRun) {
    console.log(`${colors.yellow}Dry-run mode - no changes made${colors.reset}`);
    console.log();
    console.log(`${colors.gray}To perform installation, remove --dry-run flag${colors.reset}`);
    return;
  }
  
  // Install dependencies
  console.log(`${colors.cyan}${icons.dot} Installing dependencies...${colors.reset}`);
  const depResult = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "dependency-manager.mjs")],
    { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 120000 }
  );
  
  if (depResult.status !== 0) {
    console.log(`${colors.red}${icons.cross} Dependency installation failed${colors.reset}`);
    if (options.verbose && depResult.stderr) {
      console.log(`${colors.gray}Error: ${depResult.stderr}${colors.reset}`);
    }
    process.exit(1);
  }
  console.log(`${colors.green}${icons.check} Dependencies installed${colors.reset}`);
  
  // Install plugins
  console.log();
  console.log(`${colors.cyan}${icons.dot} Installing plugins...${colors.reset}`);
  
  const installResult = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "install-plugin.mjs"), "--client=" + pluginIds.join(",")],
    { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 300000 }
  );
  
  if (installResult.status !== 0) {
    console.log(`${colors.red}${icons.cross} Installation completed with errors${colors.reset}`);
    if (options.verbose && installResult.stderr) {
      console.log(`${colors.gray}Error: ${installResult.stderr}${colors.reset}`);
    }
    process.exit(1);
  }
  
  console.log();
  console.log(`${colors.green}╔══════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║  ${colors.bright}${icons.check} Installation Complete!${colors.reset}${colors.green}                   ║${colors.reset}`);
  console.log(`${colors.green}╚══════════════════════════════════════════╝${colors.reset}`);
  console.log();
  console.log(`${colors.white}Next steps:${colors.reset}`);
  console.log(`  ${colors.cyan}${icons.arrow}${colors.reset} Restart your AI assistant(s)`);
  console.log(`  ${colors.cyan}${icons.arrow}${colors.reset} Tools will appear automatically`);
  console.log();
  console.log(`${colors.gray}Documentation: https://github.com/michielhdoteth/squish${colors.reset}`);
}

async function handleNonInteractive(flags, options) {
  const choices = getPluginChoices();
  
  if (choices.length === 0) {
    console.log(`${colors.red}No plugins available${colors.reset}`);
    process.exit(1);
  }
  
  let pluginIds = [];
  
  if (flags.all) {
    pluginIds = choices.map(c => c.value);
    if (options.verbose) {
      printHeader();
      console.log(`${colors.cyan}[AUTO MODE] Installing all plugins...${colors.reset}\n`);
    }
  } else if (flags.select.length > 0) {
    const validIds = choices.map(c => c.value);
    const invalid = flags.select.filter(s => !validIds.includes(s));
    
    if (invalid.length > 0) {
      console.log(`${colors.red}Invalid plugins: ${invalid.join(", ")}${colors.reset}`);
      console.log(`${colors.gray}Available: ${validIds.join(", ")}${colors.reset}`);
      process.exit(1);
    }
    
    pluginIds = flags.select;
    if (options.verbose) {
      printHeader();
      console.log(`${colors.cyan}[AUTO MODE] Installing: ${pluginIds.join(", ")}...${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.yellow}Auto mode requires --all or --select flag${colors.reset}`);
    const validIds = choices.map(c => c.value);
    console.log(`${colors.gray}Available plugins: ${validIds.join(", ")}${colors.reset}`);
    console.log(`Use ${colors.cyan}--list${colors.reset} to see all options`);
    process.exit(1);
  }
  
  await performInstallation(pluginIds, options);
}

async function main() {
  const flags = parseArgs(process.argv);
  
  if (flags.help) {
    printHelp();
    process.exit(0);
  }
  
  if (flags.list) {
    listPlugins();
    process.exit(0);
  }
  
  const manifest = loadManifest();
  if (!manifest) {
    console.log(`${colors.red}Error: Plugin manifest not found${colors.reset}`);
    console.log(`${colors.gray}Expected: ${manifestPath}${colors.reset}`);
    process.exit(1);
  }
  
  const options = {
    dryRun: flags.dryRun,
    verbose: flags.verbose
  };
  
  // Non-interactive mode
  if (flags.auto || flags.select.length > 0 || shouldUseNonInteractive()) {
    await handleNonInteractive(flags, options);
    return;
  }
  
  // Interactive mode
  const selectedPlugins = await interactiveMenu();
  
  if (selectedPlugins.length === 0) {
    console.log(`${colors.yellow}No plugins selected. Exiting.${colors.reset}`);
    process.exit(0);
  }
  
  await performInstallation(selectedPlugins, options);
}

process.on("SIGINT", () => {
  console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
  process.exit(0);
});

main().catch((err) => {
  console.log(`${colors.red}Fatal error:${colors.reset} ${err.message}`);
  console.error(err);
  process.exit(1);
});
