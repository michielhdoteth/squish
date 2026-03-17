#!/usr/bin/env node

/**
 * Squish Interactive Plugin Installer
 * Multi-step wizard with clack
 */

import { intro, outro, confirm, multiselect, select, isCancel, cancel, spinner, note } from '@clack/prompts';
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
  section: "─",
  cli: "⌨️",
  mcp: "🔌",
  plugin: "🔧",
  settings: "⚙️",
  local: "🏠",
  remote: "☁️",
  brain: "🧠",
  cloud: "☁️"
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
    "opencode": path.join(PLUGINS_DIR, "plugin-opencode")
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
    verbose: false,
    quick: false
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
    } else if (token === "--quick" || token === "-q") {
      flags.quick = true;
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
  console.log(`  ${c.cyan("--quick")}, ${c.cyan("-q")}       Quick install (CLI + all plugins)`);
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
  
  console.log(c.white("INTERACTIVE WIZARD:"));
  console.log(`  ${c.gray("1.")} Select components: CLI, MCP Server, Plugins`);
  console.log(`  ${c.gray("2.")} Choose plugins (if selected)`);
  console.log(`  ${c.gray("3.")} Configure mode (local/remote)`);
  console.log(`  ${c.gray("4.")} Review and install\n`);
  
  console.log(c.white("EXAMPLES:"));
  console.log(`  ${c.gray("# Interactive wizard (default)")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive\n`);
  console.log(`  ${c.gray("# Quick install (CLI + all plugins)")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive --quick\n`);
  console.log(`  ${c.gray("# Non-interactive: install all")}`);
  console.log(`  ${c.gray("$")} bun run install:interactive --auto\n`);
  
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

async function wizardComponentSelection() {
  const components = await multiselect({
    message: 'What would you like to install?',
    options: [
      {
        value: 'cli',
        label: `${icons.cli} CLI - Command line interface`,
        hint: 'squish command for terminal use'
      },
      {
        value: 'plugins',
        label: `${icons.plugin} AI Agent Plugins`,
        hint: 'Claude Code, OpenClaw, OpenCode, etc.'
      }
    ],
    required: false
  });
  
  if (isCancel(components)) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  return components;
}

async function wizardPluginSelection() {
  const choices = getPluginChoices();
  
  if (choices.length === 0) {
    console.log(c.yellow("No plugins available"));
    return [];
  }
  
  const plugins = await multiselect({
    message: 'Which AI agents do you want to integrate with?',
    options: choices,
    required: false
  });
  
  if (isCancel(plugins)) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  return plugins;
}

async function wizardConfiguration() {
  const mode = await select({
    message: 'Select operation mode:',
    options: [
      {
        value: 'local',
        label: `${icons.local} Local Mode`,
        hint: 'Everything runs locally (default, recommended)'
      },
      {
        value: 'remote',
        label: `${icons.remote} Remote Mode`,
        hint: 'Connect to remote Squish server'
      }
    ]
  });
  
  if (isCancel(mode)) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  const embeddings = await select({
    message: 'Select embeddings provider:',
    options: [
      {
        value: 'local',
        label: `${icons.brain} Local Embeddings`,
        hint: 'Uses local CPU (default, free, private)'
      },
      {
        value: 'openai',
        label: `${icons.cloud} OpenAI Embeddings`,
        hint: 'Requires OPENAI_API_KEY (better quality)'
      },
      {
        value: 'cohere',
        label: `${icons.cloud} Cohere Embeddings`,
        hint: 'Requires COHERE_API_KEY'
      }
    ]
  });
  
  if (isCancel(embeddings)) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  return { mode, embeddings };
}

async function wizardReview(installConfig) {
  const { components, plugins, config } = installConfig;
  
  let summary = `${c.white("Installation Summary:")}\n\n`;
  
  summary += `${c.cyan("Components:")}\n`;
  if (components.includes('cli')) summary += `  ${icons.check} CLI\n`;
  if (components.includes('mcp')) summary += `  ${icons.check} MCP Server\n`;
  if (components.includes('plugins')) summary += `  ${icons.check} AI Agent Plugins\n`;
  
  if (components.includes('plugins') && plugins.length > 0) {
    summary += `\n${c.cyan("Plugins:")}\n`;
    plugins.forEach(p => {
      summary += `  ${icons.check} ${p}\n`;
    });
  }
  
  summary += `\n${c.cyan("Configuration:")}\n`;
  summary += `  ${icons.settings} Mode: ${config.mode}\n`;
  summary += `  ${icons.brain} Embeddings: ${config.embeddings}\n`;
  
  note(summary, 'Review');
  
  const shouldInstall = await confirm({
    message: 'Proceed with installation?',
    initialValue: true
  });
  
  if (isCancel(shouldInstall) || !shouldInstall) {
    cancel('Installation cancelled');
    process.exit(0);
  }
  
  return shouldInstall;
}

async function performInstallation(installConfig, options = {}) {
  const { components, plugins, config } = installConfig;
  const s = spinner();
  
  if (options.dryRun) {
    console.log();
    note(`${c.yellow("Dry-run mode - no changes made")}\n\nRemove --dry-run flag to perform actual installation.`, 'Preview');
    return;
  }
  
  // Install dependencies
  if (components.length > 0 || plugins.length > 0) {
    s.start('Installing dependencies...');
    
    const depResult = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "dependency-manager.mjs")],
      { encoding: "utf8", stdio: "pipe", timeout: 120000 }
    );
    
    if (depResult.status !== 0) {
      s.stop(c.red(`${icons.cross} Dependency installation failed`));
      if (options.verbose && depResult.stderr) {
        console.log(c.gray(`Error: ${depResult.stderr}`));
      }
      process.exit(1);
    }
    
    s.stop(c.green(`${icons.check} Dependencies installed`));
  }
  
  // Install CLI
  if (components.includes('cli')) {
    s.start('Setting up CLI...');
    // CLI is already available via npm install, but we could add global link
    s.stop(c.green(`${icons.check} CLI ready`));
  }
  
  // Install plugins
  if (components.includes('plugins') && plugins.length > 0) {
    // Handle OpenCode specially - use its own installer
    const opencodeIndex = plugins.indexOf('opencode');
    if (opencodeIndex > -1) {
      plugins.splice(opencodeIndex, 1);
      
      s.start('Installing OpenCode plugin...');
      const opencodeResult = spawnSync(
        process.execPath,
        [path.join(root, "packages", "plugin-opencode", "install.mjs")],
        { encoding: "utf8", stdio: "pipe", timeout: 60000 }
      );
      
      if (opencodeResult.status !== 0) {
        s.stop(c.red(`${icons.cross} OpenCode plugin installation failed`));
        if (options.verbose && opencodeResult.stderr) {
          console.log(c.gray(`Error: ${opencodeResult.stderr}`));
        }
      } else {
        s.stop(c.green(`${icons.check} OpenCode plugin installed`));
      }
    }
    
    // Install remaining plugins using general installer
    if (plugins.length > 0) {
      s.start(`Installing ${plugins.length} plugin(s)...`);
      
      const installResult = spawnSync(
        process.execPath,
        [path.join(root, "scripts", "install-plugin.mjs"), "--client=" + plugins.join(",")],
        { encoding: "utf8", stdio: "pipe", timeout: 300000 }
      );
      
      if (installResult.status !== 0) {
        s.stop(c.red(`${icons.cross} Plugin installation failed`));
        if (options.verbose && installResult.stderr) {
          console.log(c.gray(`Error: ${installResult.stderr}`));
        }
        process.exit(1);
      }
      
      s.stop(c.green(`${icons.check} Plugins installed`));
    }
  }
  
  // Save configuration
  if (config) {
    s.start('Saving configuration...');
    // Save config to ~/.squish/config.json
    const configPath = path.join(os.homedir(), '.squish', 'config.json');
    const configDir = path.dirname(configPath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify({
      mode: config.mode,
      embeddingsProvider: config.embeddings,
      installedAt: new Date().toISOString(),
      version: '1.0.0'
    }, null, 2));
    
    s.stop(c.green(`${icons.check} Configuration saved`));
  }
}

async function runWizard(options = {}) {
  printLogo();
  
  intro(c.cyan(`${icons.squish} Squish Memory Installer`));
  
  // Step 1: Component selection
  const components = await wizardComponentSelection();
  
  if (components.length === 0) {
    cancel('No components selected. Exiting.');
    process.exit(0);
  }
  
  // Step 2: Plugin selection (if chosen)
  let plugins = [];
  if (components.includes('plugins')) {
    plugins = await wizardPluginSelection();
  }
  
  // Step 3: Configuration
  const config = await wizardConfiguration();
  
  // Step 4: Review
  const installConfig = { components, plugins, config };
  await wizardReview(installConfig);
  
  // Step 5: Install
  console.log();
  await performInstallation(installConfig, options);
  
  // Success
  console.log();
  outro(c.green(`${icons.check} Installation Complete!`));
  
  // Next steps
  console.log();
  console.log(c.white("What's next?"));
  console.log(`  ${c.cyan(icons.arrow)} Restart your AI assistant(s)`);
  console.log(`  ${c.cyan(icons.arrow)} Try: ${c.gray("squish health")}`);
  console.log(`  ${c.cyan(icons.arrow)} Try: ${c.cyan("squish remember \"Your first memory\"")}`);
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
  let components = ['cli'];
  
  if (flags.quick) {
    // Quick install: CLI + all plugins
    pluginIds = choices.map(c => c.value);
    components = ['cli', 'plugins'];
    if (options.verbose) {
      printLogo();
      console.log(`${c.cyan("[QUICK MODE]")} Installing CLI + all plugins...\n`);
    }
  } else if (flags.all) {
    pluginIds = choices.map(c => c.value);
    components = ['cli', 'mcp', 'plugins'];
    if (options.verbose) {
      printLogo();
      console.log(`${c.cyan("[AUTO MODE]")} Installing all components...\n`);
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
    components = ['cli', 'plugins'];
    if (options.verbose) {
      printLogo();
      console.log(`${c.cyan("[AUTO MODE]")} Installing: ${pluginIds.join(", ")}...\n`);
    }
  } else {
    console.log(c.yellow("Auto mode requires --all, --quick, or --select flag"));
    const validIds = choices.map(c => c.value);
    console.log(c.gray(`Available: ${validIds.join(", ")}`));
    console.log(`Use ${c.cyan("--list")} to see all options`);
    process.exit(1);
  }
  
  const installConfig = {
    components,
    plugins: pluginIds,
    config: { mode: 'local', embeddings: 'local' }
  };
  
  await performInstallation(installConfig, options);
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
  if (flags.auto || flags.quick || flags.select.length > 0 || shouldUseNonInteractive()) {
    await handleNonInteractive(flags, options);
    return;
  }
  
  // Interactive wizard mode
  await runWizard(options);
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
