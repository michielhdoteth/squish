#!/usr/bin/env node

/**
 * Squish Memory v0.9.0 - OpenClaw Self-Install Script
 *
 * Usage: npx squish-memory install
 *        node install.mjs
 *        squish install
 *
 * This script:
 * 1. Detects OpenClaw directory
 * 2. Installs Squish CLI globally if needed
 * 3. Configures MCP via mcporter
 * 4. Creates .squish data directory
 * 5. Runs health check
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SQUISH_VERSION = "0.9.0";
const OPENCLAW_DEFAULT_DIR = path.join(os.homedir(), ".openclaw");
const SQUISH_DATA_DIR = path.join(os.homedir(), ".squish");

const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m"
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function detectOpenClawDir() {
  if (process.env.OPENCLAW_HOME) {
    return process.env.OPENCLAW_HOME;
  }
  return OPENCLAW_DEFAULT_DIR;
}

function checkCommandAvailable(cmd) {
  const result = spawnSync(cmd, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function getSquishBinary() {
  if (checkCommandAvailable("squish")) {
    return "squish";
  }

  const candidates = [
    path.join(os.homedir(), ".local", "bin", "squish"),
    path.join(os.homedir(), "node_modules", ".bin", "squish"),
    "/usr/local/bin/squish",
    "/usr/bin/squish"
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function installSquishGlobally() {
  log("blue", "Installing squish-memory globally...");

  let result = spawnSync("bun", ["add", "-g", "squish-memory"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    log("yellow", "bun not available, trying npm...");
    result = spawnSync("npm", ["install", "-g", "squish-memory"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "inherit"
    });
  }

  return result.status === 0;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log("green", `Created directory: ${dirPath}`);
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function backupIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    log("yellow", `Backed up: ${backupPath}`);
    return backupPath;
  }
  return null;
}

function configureMcporter(openclawDir) {
  const mcporterPath = path.join(openclawDir, "mcporter.json");

  const squishConfig = {
    command: "squish",
    args: [],
    env: {
      SQUISH_MODE: "local",
      SQUISH_EMBEDDINGS_PROVIDER: "local"
    },
    transport: "stdio"
  };

  let config = readJson(mcporterPath) || { mcpServers: {} };

  if (config.mcpServers?.squish) {
    log("cyan", "Squish already configured in mcporter.json");
    return true;
  }

  backupIfExists(mcporterPath);

  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  config.mcpServers.squish = squishConfig;

  writeJson(mcporterPath, config);
  log("green", `Configured mcporter: ${mcporterPath}`);

  return true;
}

function runHealthCheck() {
  const squishBin = getSquishBinary();
  if (!squishBin) {
    log("yellow", "Squish binary not found, skipping health check");
    return false;
  }

  log("blue", "Running health check...");
  const result = spawnSync(squishBin, ["health"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  return result.status === 0;
}

function printSuccess(openclawDir) {
  console.log("");
  log("green", "===========================================");
  log("green", `  Squish Memory v${SQUISH_VERSION} Installed!`);
  log("green", "===========================================");
  console.log("");
  log("cyan", "Configuration:");
  console.log(`  OpenClaw dir: ${openclawDir}`);
  console.log(`  Data dir:     ${SQUISH_DATA_DIR}`);
  console.log(`  MCP config:   ${path.join(openclawDir, "mcporter.json")}`);
  console.log("");
  log("cyan", "CLI Commands:");
  console.log("  squish health              - Check service health");
  console.log("  squish remember \"text\"    - Store a memory");
  console.log("  squish search \"query\"     - Search memories");
  console.log("  squish stats               - View statistics");
  console.log("");
  log("cyan", "MCP Tools (via mcporter):");
  console.log("  remember, search, recall, observe");
  console.log("  context, health, core_memory, forget");
  console.log("");
  log("blue", "Documentation: https://github.com/michielhdoteth/squish");
  console.log("");
}

function printDryRun(openclawDir) {
  log("cyan", "=== DRY RUN MODE ===");
  console.log("");
  console.log("Would perform:");
  console.log(`  1. Ensure OpenClaw dir: ${openclawDir}`);
  console.log(`  2. Ensure data dir: ${SQUISH_DATA_DIR}`);
  console.log(`  3. Configure mcporter: ${path.join(openclawDir, "mcporter.json")}`);
  console.log(`  4. Run health check`);
  console.log("");
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    openclawDir: null,
    skipInstall: false
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dry-run" || token === "-n") {
      args.dryRun = true;
      continue;
    }
    if (token === "--openclaw-dir" || token === "-o") {
      args.openclawDir = path.resolve(argv[i + 1]);
      i++;
      continue;
    }
    if (token === "--skip-install") {
      args.skipInstall = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(`
Squish Memory v${SQUISH_VERSION} - OpenClaw Self-Install

Usage: npx squish-memory install [options]

Options:
  --dry-run, -n          Show what would be done without making changes
  --openclaw-dir, -o     Specify OpenClaw directory (default: ~/.openclaw)
  --skip-install         Skip global npm install step
  --help, -h             Show this help message
`);
      process.exit(0);
    }
  }

  return args;
}

/**
 * Run the installer programmatically (for CLI command)
 */
export async function runInstall(options = {}) {
  const {
    dryRun = false,
    openclawDir: customOpenclawDir = null,
    skipInstall = false
  } = options;

  log("blue", `Squish Memory v${SQUISH_VERSION} - OpenClaw Installer`);
  log("blue", "===================================================");
  console.log("");

  const openclawDir = customOpenclawDir || detectOpenClawDir();

  if (dryRun) {
    printDryRun(openclawDir);
    return { success: true, dryRun: true };
  }

  // Step 1: Check/install Squish globally
  let squishBin = getSquishBinary();
  if (!squishBin && !skipInstall) {
    const installed = installSquishGlobally();
    if (!installed) {
      log("red", "Failed to install squish-memory globally");
      log("yellow", "Please install manually: npm install -g squish-memory");
      return { success: false, error: "Failed to install globally" };
    }
    squishBin = getSquishBinary();
  }

  if (!squishBin) {
    log("red", "Squish binary not found after installation");
    return { success: false, error: "Squish binary not found" };
  }

  log("green", `Squish binary: ${squishBin}`);

  // Step 2: Ensure OpenClaw directory exists
  ensureDir(openclawDir);

  // Step 3: Ensure .squish data directory exists
  ensureDir(SQUISH_DATA_DIR);

  // Step 4: Configure mcporter
  configureMcporter(openclawDir);

  // Step 5: Run health check
  const healthOk = runHealthCheck();

  if (!healthOk) {
    log("yellow", "Health check failed, but installation completed");
    log("yellow", "You may need to restart your shell or add squish to PATH");
  }

  // Print success message
  printSuccess(openclawDir);

  return { success: true };
}

/**
 * Main entry point when run directly
 */
async function main() {
  const args = parseArgs(process.argv);
  const result = await runInstall({
    dryRun: args.dryRun,
    openclawDir: args.openclawDir,
    skipInstall: args.skipInstall
  });

  if (!result.success) {
    process.exit(1);
  }
}

// Run main if executed directly
main().catch((err) => {
  log("red", `Installation failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
