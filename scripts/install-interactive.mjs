#!/usr/bin/env node

/**
 * Squish Interactive Plugin Installer
 * Beautiful terminal UI matching skills.sh style
 */

import { intro, outro, confirm, multiselect, isCancel, cancel } from '@clack/prompts';
import picocolors from 'picocolors';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "config", "plugin-manifest.json");

const c = picocolors;

const icons = {
  squish: "🐙",
  check: "✓",
  cross: "✗",
  package: "📦",
  arrow: "→",
  dot: "●",
  circle: "○",
  diamond: "◆",
  pointer: "❯",
  line: "│",
  corner: "└",
  section: "─"
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

function printLogo() {
  console.log(c.cyan(`
███████╗ ██████╗ ██╗   ██╗██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██║██╔════╝██║  ██║
███████╗██║   ██║██║   ██║██║███████╗███████║
╚════██║██║   ██║██║   ██║██║╚════██║██╔══██║
███████║╚██████╔╝╚██████╔╝██║███████║██║  ██║
╚══════╝ ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝
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
      console.log(c.red(`Unknown flag: ${token}`));
      console.log(`Run ${c.cyan("--help")} for usage information`);
      process.exit(1);
    }
  }
  
  return flags;
}

function printHelp() {
  printLogo();
  console.log(c.white("USAGE:"));
  console.log(`  ${c.cyan("bun run install:interactive")} [OPTIONS]\n`);
  
  console.log(c.white("OPTIONS:"));
  console.log(`  ${c.cyan("--auto")}, ${c.cyan("-a")}        Skip menu, install all available plugins`);
  console.log(`  ${c.cyan("--select")}=<list>     Pre-select plugins (comma-separated)`);
  console.log(`  ${c.cyan("--all")}               Install all available plugins`);
  console.log(`  ${c.cyan("--list")}, ${c.cyan("-l")}        List available plugins and exit`);
  console.log(`  ${c.cyan("--dry-run")}, ${c.cyan("-n")}      Preview changes without installing`);
  console.log(`  ${c.cyan("--verbose")}, ${c.cyan("-v")}     Show detailed output`);
  console.log(`  ${c.cyan("--help")}, ${c.cyan("-h")}       Show this help message\n`);
  
  console.log(c.white("ENVIRONMENT VARIABLES:"));
  console.log(`  ${c.cyan("CI=true")}                  Force non-interactive mode`);
  console.log(`  ${c.cyan("NON_INTERACTIVE=1")}         Force non-interactive mode`);
  console.log(`  ${c.cyan("AUTOMATION=true")}           Force non-interactive mode\n`);
  
  console.log(c.white("EXAMPLES:"));
  console.log(`  ${c.gray("# Interactive menu (default)")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive\n`);
  console.log(`  ${c.gray("# Non-interactive: install all")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive --auto\n`);
  console.log(`  ${c.gray("# Non-interactive: specific plugins")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive --select=claude-code,openclaw\n`);
  
  console.log(c.gray("────────────────────────────────────────────────────"));
  console.log(c.gray("Documentation: https://github.com/michielhdoteth/squish"));
}

function listPlugins() {
  const manifest = loadManifest();
  if (!manifest || !manifest.targets) {
    console.log(c.red("Error: Plugin manifest not found"));
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
  
  printLogo();
  console.log(c.white("Available Plugins:"));
  console.log(c.gray("────────────────────────────────────────────────────"));
  console.log();
  
  let i = 1;
  for (const [client, config] of Object.entries(manifest.targets)) {
    const isInstalled = installed[client];
    const hasSource = checkPluginSource(client);
    
    const status = isInstalled 
      ? `${c.green(icons.check)} installed`
      : `${c.yellow(icons.dot)} not installed`;
    
    const source = hasSource
      ? `${c.cyan(icons.package)} source`
      : `${c.red(icons.cross)} no source`;
    
    console.log(`  ${i}. ${c.white(clientNames[client] || client)}`);
    console.log(`     ${c.gray("Type:")} ${config.type || 'unknown'}`);
    console.log(`     ${status}  ${source}`);
    console.log();
    i++;
  }
  
  console.log(c.gray("────────────────────────────────────────────────────"));
  console.log(c.gray(`Total: ${i - 1} plugins available`));
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
    
    let label = name;
    if (isInstalled) label += ` ${c.green(icons.check)}`;
    if (hasSource) label += ` ${c.cyan(icons.package)}`;
    
    return {
      value: client,
      label: label,
      hint: type
    };
  });
}

async function interactiveMenu() {
  const choices = getPluginChoices();
  
  if (choices.length === 0) {
    console.log(c.red("No plugins available"));
    process.exit(1);
  }
  
  printLogo();
  
  const plugins = await multiselect({
    message: 'Which plugins do you want to install?',
    options: choices,
    required: true
  });
  
  if (isCancel(plugins)) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  return plugins;
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
  console.log(c.white("Installing plugins:"));
  console.log(c.gray("────────────────────────────────────────────────────"));
  
  pluginIds.forEach((id, i) => {
    console.log(`  ${i + 1}. ${clientNames[id] || id}`);
  });
  console.log();
  
  if (options.dryRun) {
    console.log(c.yellow("Dry-run mode - no changes made"));
    console.log();
    console.log(c.gray("To perform installation, remove --dry-run flag"));
    return;
  }
  
  // Install dependencies
  console.log(`${c.cyan(icons.dot)} Installing dependencies...`);
  const depResult = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "dependency-manager.mjs")],
    { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 120000 }
  );
  
  if (depResult.status !== 0) {
    console.log(`${c.red(icons.cross)} Dependency installation failed`);
    if (options.verbose && depResult.stderr) {
      console.log(c.gray(`Error: ${depResult.stderr}`));
    }
    process.exit(1);
  }
  console.log(`${c.green(icons.check)} Dependencies installed`);
  
  // Install plugins
  console.log();
  console.log(`${c.cyan(icons.dot)} Installing plugins...`);
  
  const installResult = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "install-plugin.mjs"), "--client=" + pluginIds.join(",")],
    { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 300000 }
  );
  
  if (installResult.status !== 0) {
    console.log(`${c.red(icons.cross)} Installation completed with errors`);
    if (options.verbose && installResult.stderr) {
      console.log(c.gray(`Error: ${installResult.stderr}`));
    }
    process.exit(1);
  }
  
  console.log();
  outro(`${c.green(icons.check)} Installation Complete!`);
  
  console.log();
  console.log(c.white("Next steps:"));
  console.log(`  ${c.cyan(icons.arrow)} Restart your AI assistant(s)`);
  console.log(`  ${c.cyan(icons.arrow)} Tools will appear automatically`);
  console.log();
  console.log(c.gray("Documentation: https://github.com/michielhdoteth/squish"));
}

async function handleNonInteractive(flags, options) {
  const choices = getPluginChoices();
  
  if (choices.length === 0) {
    console.log(c.red("No plugins available"));
    process.exit(1);
  }
  
  let pluginIds = [];
  
  if (flags.all) {
    pluginIds = choices.map(c => c.value);
    if (options.verbose) {
      printLogo();
      console.log(`${c.cyan("[AUTO MODE]")} Installing all plugins...\n`);
    }
  } else if (flags.select.length > 0) {
    const validIds = choices.map(c => c.value);
    const invalid = flags.select.filter(s => !validIds.includes(s));
    
    if (invalid.length > 0) {
      console.log(c.red(`Invalid plugins: ${invalid.join(", ")}`));
      console.log(c.gray(`Available: ${validIds.join(", ")}`));
      process.exit(1);
    }
    
    pluginIds = flags.select;
    if (options.verbose) {
      printLogo();
      console.log(`${c.cyan("[AUTO MODE]")} Installing: ${pluginIds.join(", ")}...\n`);
    }
  } else {
    console.log(c.yellow("Auto mode requires --all or --select flag"));
    const validIds = choices.map(c => c.value);
    console.log(c.gray(`Available plugins: ${validIds.join(", ")}`));
    console.log(`Use ${c.cyan("--list")} to see all options`);
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
    console.log(c.red("Error: Plugin manifest not found"));
    console.log(c.gray(`Expected: ${manifestPath}`));
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
  
  // Interactive mode with clack
  const selectedPlugins = await interactiveMenu();
  
  if (selectedPlugins.length === 0) {
    console.log(c.yellow("No plugins selected. Exiting."));
    process.exit(0);
  }
  
  await performInstallation(selectedPlugins, options);
}

process.on("SIGINT", () => {
  console.log(`\n${c.yellow("Installation cancelled.")}`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n${c.yellow("Installation cancelled.")}`);
  process.exit(0);
});

main().catch((err) => {
  console.log(c.red(`Fatal error: ${err.message}`));
  console.error(err);
  process.exit(1);
});
