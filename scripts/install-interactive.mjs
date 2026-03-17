#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

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
  reset: "\x1b[0m",
  cursorUp: (n) => `\x1b[${n}A`,
  clearLine: "\x1b[2K",
  clearScreen: "\x1b[2J\x1b[H"
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

function getAvailablePlugins() {
  const plugins = [];
  const manifest = loadManifest();
  
  if (!manifest || !manifest.targets) {
    return [];
  }
  
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
    "hooks": "Session hooks for automatic memory capture",
    "plugin-slot": "Memory slot via MCP bridge",
    "mcp": "MCP server configuration"
  };
  
  for (const [client, config] of Object.entries(manifest.targets)) {
    plugins.push({
      id: client,
      name: config.name || clientNames[client] || client,
      description: config.description || `${typeDescriptions[config.type] || "Plugin"} - ${clientNames[client] || client}`,
      type: config.type || "unknown",
      available: true
    });
  }
  
  return plugins;
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
    } else if (token.startsWith("--select=")) {
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

function printHelp() {
  console.log(`
${colors.bright}${colors.cyan}Squish Plugin Installer - Interactive Mode${colors.reset}
${colors.gray}═════════════════════════════════════════════${colors.reset}

${colors.white}USAGE:${colors.reset}
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

  # Dry-run to test
  ${colors.gray}$} bun run install:interactive --select=claude-code --dry-run${colors.reset}

${colors.white}MENU CONTROLS (when interactive):${colors.reset}
  ${colors.cyan}[SPACE]${colors.reset} Toggle selection     ${colors.cyan}[↑↓]${colors.reset} Navigate
  ${colors.cyan}[j/k]${colors.reset} Vim-style navigation
  ${colors.cyan}[Ctrl+A]${colors.reset} Toggle all
  ${colors.cyan}[ENTER]${colors.reset} Install
  ${colors.cyan}[ESC]${colors.reset} Cancel

${colors.gray}────────────────────────────────────────────────────${colors.reset}
${colors.gray}Documentation: https://github.com/michielhdoteth/squish${colors.reset}
`);
}

function listPlugins() {
  const plugins = getAvailablePlugins();
  const installed = detectInstalledClients();
  
  if (plugins.length === 0) {
    console.log(`${colors.yellow}No plugins available${colors.reset}`);
    return;
  }
  
  console.log(`${colors.bright}${colors.cyan}Available Plugins:${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
  console.log("");
  
  plugins.forEach((plugin, i) => {
    const status = installed[plugin.id]
      ? `${colors.green}✓${colors.reset} installed`
      : `${colors.yellow}○${colors.reset} not installed`;
    
    const source = checkPluginSource(plugin.id)
      ? `${colors.cyan}📦${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    
    console.log(`  ${i + 1}. ${plugin.name} (${plugin.id})`);
    console.log(`     ${colors.gray}Type:${colors.reset} ${plugin.type}`);
    console.log(`     ${colors.gray}Status:${colors.reset} ${status} ${source}`);
    console.log(`     ${colors.gray}Description:${colors.reset} ${plugin.description}`);
    console.log("");
  });
  
  console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
  console.log(`Total: ${plugins.length} plugins`);
}

class Menu {
  constructor(options) {
    this.options = options.map((opt, index) => ({
      ...opt,
      index,
      selected: opt.defaultSelected || false,
      enabled: opt.enabled !== false
    }));
    this.currentIndex = this.options.findIndex((o) => o.enabled);
    this.scrollOffset = 0;
    this.maxVisible = this.getTerminalHeight();
  }
  
  getTerminalHeight() {
    try {
      return Math.max(5, process.stdout.rows - 8);
    } catch {
      return 5;
    }
  }
  
  render() {
    const visibleOptions = this.getVisibleOptions();
    const totalHeight = visibleOptions.length + 4;
    
    try {
      console.log(colors.cursorUp(totalHeight));
    } catch {
      console.log(colors.clearScreen);
    }
    
    this.renderHeader();
    this.renderOptions(visibleOptions);
    this.renderFooter();
  }
  
  renderHeader() {
    console.log(`${colors.bright}${colors.cyan}╔══════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  Squish Plugin Installer - Interactive Mode ${colors.bright}${colors.cyan}         ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚══════════════════════════════════════════╝${colors.reset}`);
    console.log("");
  }
  
  renderOptions(visibleOptions) {
    const installedClients = detectInstalledClients();
    
    visibleOptions.forEach((option) => {
      const cursor = option.index === this.currentIndex ? "▶ " : "  ";
      const checkbox = option.enabled
        ? (option.selected ? `${colors.green}[x]${colors.reset}` : `[ ]`)
        : `${colors.gray}[ ]${colors.reset}`;
      
      const name = option.index === this.currentIndex
        ? `${colors.bright}${colors.white}${option.name}${colors.reset}`
        : option.name;
      
      const status = option.enabled
        ? (installedClients[option.id]
          ? `${colors.gray}  ${colors.green}✓${colors.reset} installed`
          : `${colors.gray}  ${colors.yellow}○${colors.reset} not installed`)
        : `${colors.gray}  N/A${colors.reset}`;
      
      const sourceStatus = checkPluginSource(option.id)
        ? `${colors.gray}  ${colors.cyan}📦${colors.reset} source available`
        : `${colors.gray}  ${colors.red}✗${colors.reset} no source`;
      
      console.log(`${cursor}${checkbox} ${name}${status}${sourceStatus}`);
      
      if (option.description && option.index === this.currentIndex) {
        console.log(`${colors.gray}      ${option.description}${colors.reset}`);
      }
    });
  }
  
  renderFooter() {
    console.log("");
    const selectedCount = this.options.filter((o) => o.selected && o.enabled).length;
    const availableCount = this.options.filter((o) => o.enabled).length;
    
    console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.cyan}Selected: ${colors.bright}${selectedCount}${colors.reset} / ${availableCount} available plugins`);
    console.log(`${colors.gray}────────────────────────────────────────────────────${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}[SPACE]${colors.reset} Toggle selection  ${colors.cyan}[↑↓]${colors.reset} Navigate  ${colors.cyan}[ENTER]${colors.reset} Install  ${colors.cyan}[ESC]${colors.reset} Cancel`);
  }
  
  getVisibleOptions() {
    const start = this.scrollOffset;
    const end = Math.min(start + this.maxVisible, this.options.length);
    return this.options.slice(start, end);
  }
  
  moveUp() {
    const enabledIndices = this.options
      .map((o, i) => ({ index: i, enabled: o.enabled }))
      .filter((o) => o.enabled)
      .map((o) => o.index);
    
    const currentIndex = enabledIndices.indexOf(this.currentIndex);
    if (currentIndex > 0) {
      this.currentIndex = enabledIndices[currentIndex - 1];
      this.adjustScroll();
      this.render();
    }
  }
  
  moveDown() {
    const enabledIndices = this.options
      .map((o, i) => ({ index: i, enabled: o.enabled }))
      .filter((o) => o.enabled)
      .map((o) => o.index);
    
    const currentIndex = enabledIndices.indexOf(this.currentIndex);
    if (currentIndex < enabledIndices.length - 1) {
      this.currentIndex = enabledIndices[currentIndex + 1];
      this.adjustScroll();
      this.render();
    }
  }
  
  toggleSelection() {
    const currentOption = this.options[this.currentIndex];
    if (currentOption && currentOption.enabled) {
      currentOption.selected = !currentOption.selected;
      this.render();
    }
  }
  
  toggleAll() {
    const enabledOptions = this.options.filter((o) => o.enabled);
    const allSelected = enabledOptions.every((o) => o.selected);
    enabledOptions.forEach((o) => {
      o.selected = !allSelected;
    });
    this.render();
  }
  
  adjustScroll() {
    const visibleOptions = this.getVisibleOptions();
    const isVisible = visibleOptions.some((o) => o.index === this.currentIndex);
    
    if (!isVisible) {
      if (this.currentIndex < this.scrollOffset) {
        this.scrollOffset = this.currentIndex;
      } else {
        const maxStart = this.options.length - this.maxVisible;
        this.scrollOffset = Math.min(maxStart, this.currentIndex - this.maxVisible + 1);
      }
    }
  }
  
  getSelectedOptions() {
    return this.options.filter((o) => o.selected && o.enabled);
  }
}

function createKeyHandler(menu, rl) {
  return (key, rl) => {
    if (key.name === "up" || key.name === "k") {
      menu.moveUp();
    } else if (key.name === "down" || key.name === "j") {
      menu.moveDown();
    } else if (key.name === "space") {
      menu.toggleSelection();
    } else if (key.name === "a" && key.ctrl) {
      menu.toggleAll();
    } else if (key.name === "return") {
      rl.close();
      const selected = menu.getSelectedOptions();
      if (selected.length === 0) {
        console.log(`\n${colors.yellow}No plugins selected. Installation cancelled.${colors.reset}`);
        process.exit(0);
      }
      performInstallation(selected);
    } else if (key.name === "escape") {
      rl.close();
      console.log(`\n${colors.yellow}Installation cancelled.${colors.reset}`);
      process.exit(0);
    }
  };
}

async function performInstallation(selectedPlugins, options = {}) {
  console.log("");
  console.log(colors.clearScreen);
  console.log(`${colors.bright}${colors.blue}Squish Plugin Installer${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────────${colors.reset}`);
  console.log("");
  
  console.log(`${colors.green}Selected plugins:${colors.reset}`);
  selectedPlugins.forEach((plugin, i) => {
    console.log(`  ${i + 1}. ${plugin.name} (${plugin.id})`);
  });
  console.log("");
  
  const manifest = loadManifest();
  if (!manifest) {
    console.log(`${colors.red}Error: Plugin manifest not found${colors.reset}`);
    process.exit(1);
  }
  
  if (!options.dryRun) {
    console.log(`${colors.cyan}Installing dependencies...${colors.reset}`);
    const depResult = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "dependency-manager.mjs")],
      { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 120000 }
    );
    
    if (depResult.status !== 0) {
      console.log(`${colors.red}Dependency installation failed${colors.reset}`);
      if (options.verbose && depResult.stderr) {
        console.log(`${colors.gray}Error output:${colors.reset}\n${depResult.stderr}`);
      }
      process.exit(1);
    }
    
    console.log("");
    console.log(`${colors.cyan}Installing plugins...${colors.reset}`);
    
    const clientList = selectedPlugins.map((p) => p.id).join(",");
    const installArgs = [path.join(root, "scripts", "install-plugin.mjs"), "--client=" + clientList];
    
    if (options.dryRun) {
      installArgs.push("--dry-run");
    }
    
    const installResult = spawnSync(
      process.execPath,
      installArgs,
      { encoding: "utf8", stdio: options.verbose ? "inherit" : "pipe", timeout: 300000 }
    );
    
    if (installResult.status !== 0) {
      console.log("");
      console.log(`${colors.red}Installation completed with errors${colors.reset}`);
      if (options.verbose && installResult.stderr) {
        console.log(`${colors.gray}Error output:${colors.reset}\n${installResult.stderr}`);
      }
      process.exit(1);
    } else {
      console.log("");
      console.log(`${colors.green}╔══════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.green}║${colors.reset}  ${colors.bright}Installation Complete!${colors.reset}                        ${colors.green}║${colors.reset}`);
      console.log(`${colors.green}╚══════════════════════════════════════════╝${colors.reset}`);
      console.log("");
      console.log(`${colors.cyan}Next steps:${colors.reset}`);
      console.log(`  ${colors.white}→${colors.reset} Restart your AI assistant(s)`);
      console.log(`  ${colors.white}→${colors.reset} Tools will appear automatically`);
      console.log("");
      console.log(`${colors.gray}Documentation: https://github.com/michielhdoteth/squish${colors.reset}`);
    }
  } else {
    console.log(`${colors.yellow}Dry-run mode - no changes made${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}Would install:${colors.reset}`);
    selectedPlugins.forEach((plugin, i) => {
      console.log(`  ${i + 1}. ${plugin.name} (${plugin.id})`);
    });
    console.log("");
    console.log(`To perform installation, remove ${colors.cyan}--dry-run${colors.reset} flag`);
  }
}

function handleNonInteractive(flags, options) {
  const plugins = getAvailablePlugins();
  
  if (plugins.length === 0) {
    console.log(`${colors.yellow}No plugins available${colors.reset}`);
    process.exit(1);
  }
  
  let pluginsToInstall = [];
  
  if (flags.all) {
    pluginsToInstall = plugins.map((p) => p.id);
    if (options.verbose) {
      console.log(`${colors.cyan}[AUTO MODE]${colors.reset} Installing all available plugins...`);
    }
  } else if (flags.select.length > 0) {
    const validPlugins = plugins.map((p) => p.id);
    const invalid = flags.select.filter((s) => !validPlugins.includes(s));
    
    if (invalid.length > 0) {
      console.log(`${colors.red}Invalid plugins: ${invalid.join(", ")}${colors.reset}`);
      console.log(`${colors.gray}Available: ${validPlugins.join(", ")}${colors.reset}`);
      process.exit(1);
    }
    
    pluginsToInstall = flags.select;
    if (options.verbose) {
      console.log(`${colors.cyan}[AUTO MODE]${colors.reset} Installing: ${pluginsToInstall.join(", ")}...`);
    }
  } else {
    console.log(`${colors.yellow}Auto mode requires --all or --select flag${colors.reset}`);
    console.log(`Available plugins: ${plugins.map((p) => p.id).join(", ")}`);
    console.log(`Use ${colors.cyan}--list${colors.reset} to see all options`);
    process.exit(1);
  }
  
  const selectedPlugins = plugins.filter((p) => pluginsToInstall.includes(p.id));
  
  if (selectedPlugins.length === 0) {
    console.log(`${colors.yellow}No plugins to install${colors.reset}`);
    process.exit(0);
  }
  
  performInstallation(selectedPlugins, options);
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
    console.log(`${colors.gray}Expected location: ${manifestPath}${colors.reset}`);
    process.exit(1);
  }
  
  const options = {
    dryRun: flags.dryRun,
    verbose: flags.verbose
  };
  
  if (flags.auto || flags.select.length > 0 || shouldUseNonInteractive()) {
    handleNonInteractive(flags, options);
    return;
  }
  
  console.log(`${colors.clearScreen}`);
  
  const plugins = getAvailablePlugins();
  
  if (plugins.length === 0) {
    console.log(`${colors.yellow}No plugins available in manifest${colors.reset}`);
    console.log(`${colors.gray}Check config/plugin-manifest.json${colors.reset}`);
    process.exit(1);
  }
  
  const menuOptions = plugins.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    type: plugin.type,
    defaultSelected: false,
    enabled: true
  }));
  
  const menu = new Menu(menuOptions);
  
  let rl = null;
  
  try {
    rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  } catch (error) {
    console.log(`${colors.yellow}Warning: Could not initialize readline interface${colors.reset}`);
    console.log(`${colors.gray}Falling back to non-interactive mode...${colors.reset}`);
    console.log(`${colors.gray}Use --auto or --select flags for automation${colors.reset}`);
    handleNonInteractive({ all: true }, options);
    return;
  }
  
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  } catch (error) {
    console.log(`${colors.yellow}Warning: Could not set raw mode${colors.reset}`);
    console.log(`${colors.gray}Using fallback mode...${colors.reset}`);
  }
  
  rl.on("keypress", (_, key) => {
    if (key) {
      createKeyHandler(menu)(key, rl);
    }
  });
  
  process.stdout.on("resize", () => {
    menu.maxVisible = menu.getTerminalHeight();
    menu.render();
  });
  
  console.log(colors.clearScreen);
  menu.render();
}

process.on("SIGINT", () => {
  console.log("\n");
  console.log(`${colors.yellow}Installation cancelled.${colors.reset}`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n");
  console.log(`${colors.yellow}Installation cancelled.${colors.reset}`);
  process.exit(0);
});

main().catch((err) => {
  console.log(`${colors.red}Fatal error:${colors.reset} ${err.message}`);
  console.error(err);
  process.exit(1);
});
