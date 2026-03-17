#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "config", "plugin-manifest.json");

// Client default directories
const CLIENT_DIRS = {
  "claude-code": path.join(os.homedir(), ".claude"),
  opencode: path.join(os.homedir(), ".config", "opencode"),
  codex: path.join(os.homedir(), ".codex"),
  cursor: path.join(os.homedir(), ".cursor"),
  vscode: path.join(os.homedir(), ".vscode", "mcp"),
  windsurf: path.join(os.homedir(), ".windsurf"),
  openclaw: path.join(os.homedir(), ".openclaw")
};

// Must-have clients (launch priority)
const MUST_HAVE = ["claude-code", "openclaw", "opencode"];
const NICE_TO_HAVE = ["codex", "cursor", "vscode", "windsurf"];

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Plugin manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function parseArgs(argv) {
  const args = {
    client: [],
    dryRun: false,
    verify: false,
    uninstall: false,
    strict: false,
    skipDeps: false
  };
  
  const argHandlers = {
    "--dry-run": () => args.dryRun = true,
    "-d": () => args.dryRun = true,
    "--verify": () => args.verify = true,
    "-v": () => args.verify = true,
    "--uninstall": () => args.uninstall = true,
    "-u": () => args.uninstall = true,
    "--strict": () => args.strict = true,
    "--skip-deps": () => args.skipDeps = true,
    "--client": (i) => {
      const clientList = argv[i + 1];
      args.client = clientList.split(",").map(c => c.trim());
    },
    "-c": (i) => {
      const clientList = argv[i + 1];
      args.client = clientList.split(",").map(c => c.trim());
    },
  };
  
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    const handler = argHandlers[token];
    
    if (handler) {
      if (token === "--client" || token === "-c") {
        handler(i);
        i++;
      } else {
        handler();
      }
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function expandHomePath(filePath) {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`[INSTALL] Backed up: ${filePath} → ${backupPath}`);
  }
}

function copyFile(sourcePath, targetPath, options = {}) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  
  if (options.backup !== false) {
    backupFile(targetPath);
  }
  
  if (!options.dryRun) {
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
  
  const mode = options.dryRun ? "DRY_RUN" : "COPIED";
  console.log(`[INSTALL] ${mode}: ${sourcePath} → ${targetPath}`);
}

function runCommand(command, args = [], options = {}) {
  const mode = options.dryRun ? "[DRY_RUN] Would run:" : "Running:";
  console.log(`[INSTALL] ${mode} ${command} ${args.join(" ")}`);
  
  if (options.dryRun) {
    return { status: 0, stdout: "", stderr: "" };
  }
  
  const result = spawnSync(command, args, { 
    encoding: "utf8",
    stdio: options.silent ? "pipe" : "inherit",
    timeout: options.timeout || 30000 
  });
  
  return result;
}

function checkDependencies(manifest, options) {
  console.log("\n[DEP] Checking dependencies...");
  
  if (options.skipDeps) {
    console.log("[DEP] Skipping dependency check (--skip-deps)");
    return true;
  }
  
  // Run dependency manager
  const depArgs = options.dryRun ? ["--dry-run"] : [];
  const depResult = runCommand(
    process.execPath,
    [path.join(root, "scripts", "dependency-manager.mjs"), ...depArgs],
    { ...options, silent: true }
  );
  
  if (depResult.status !== 0) {
    console.error("[DEP] Dependency check failed:");
    console.error(depResult.stderr);
    return false;
  }
  
  console.log(depResult.stdout);
  return true;
}

function installForClient(client, manifest, options) {
  const targetConfig = manifest.targets[client];
  if (!targetConfig) {
    throw new Error(`Unsupported client: ${client}. Supported: ${Object.keys(manifest.targets).join(", ")}`);
  }
  
  console.log(`\n[INSTALL] Installing for ${client}...`);
  
  const install = targetConfig.install;
  if (!install) {
    console.log(`[INSTALL] ⚠ No install steps defined for ${client}, skipping`);
    return true;
  }
  
  try {
    if (install.copy) {
      for (const item of install.copy) {
        const sourcePath = path.join(root, item.from);
        const targetPath = expandHomePath(item.to);
        copyFile(sourcePath, targetPath, options);
      }
    }
    
    if (install.command) {
      runCommand(install.command, [], { dryRun: options.dryRun });
    }
    
    console.log(`[INSTALL] ✓ ${client} installation complete`);
    return true;
    
  } catch (error) {
    console.error(`[INSTALL] ✗ Failed to install for ${client}:`, error.message);
    return false;
  }
}

function verifyClient(client, manifest) {
  const targetConfig = manifest.targets[client];
  if (!targetConfig || !targetConfig.verify) {
    console.log(`[VERIFY] ⚠ No verification steps for ${client}`);
    return { ok: true, message: "No verification defined" };
  }
  
  console.log(`[VERIFY] Verifying ${client} installation...`);
  const verify = targetConfig.verify;
  
  try {
    if (verify.fileExists) {
      const filePath = expandHomePath(verify.fileExists);
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: `File not found: ${filePath}` };
      }
      console.log(`[VERIFY] ✓ File exists: ${filePath}`);
    }
    
    if (verify.toolCheck) {
      console.log(`[VERIFY] Testing tool: ${verify.toolCheck}`);
      const result = spawnSync(
        process.execPath,
        [path.join(root, "dist", "commands", "mcp-server.cjs"), "--health"],
        { encoding: "utf8", timeout: 10000 }
      );
      
      if (result.status !== 0) {
        return { ok: false, error: "MCP server health check failed" };
      }
      console.log(`[VERIFY] ✓ MCP server healthy`);
    }
    
    return { ok: true, message: "Verification passed" };
    
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function uninstallClient(client, manifest, options) {
  const targetConfig = manifest.targets[client];
  if (!targetConfig) {
    throw new Error(`Unsupported client: ${client}`);
  }
  
  console.log(`\n[UNINSTALL] Removing ${client} configuration...`);
  const install = targetConfig.install;
  
  if (!install || !install.copy) {
    console.log(`[UNINSTALL] ⚠ No files to remove for ${client}`);
    return true;
  }
  
  try {
    for (const item of install.copy) {
      const targetPath = expandHomePath(item.to);
      
      if (fs.existsSync(targetPath)) {
        if (!options.dryRun) {
          try {
            fs.unlinkSync(targetPath);
          } catch (e) {
            if (fs.statSync(targetPath).isDirectory()) {
              console.log(`[UNINSTALL] Skipping directory: ${targetPath} (manual removal required)`);
              continue;
            }
            throw e;
          }
        }
        console.log(`[UNINSTALL] ${options.dryRun ? "[DRY_RUN] Would remove:" : "Removed"}: ${targetPath}`);
      } else {
        console.log(`[UNINSTALL] Not found: ${targetPath}`);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error(`[UNINSTALL] ✗ Failed to uninstall ${client}:`, error.message);
    return false;
  }
}

function detectInstalledClients() {
  const detected = {};
  for (const [client, dir] of Object.entries(CLIENT_DIRS)) {
    try {
      detected[client] = fs.existsSync(dir);
    } catch {
      detected[client] = false;
    }
  }
  return detected;
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = loadManifest();
  
  console.log(`[INSTALL] Squish Universal Plugin Installer v${manifest.version}`);
  console.log(`[INSTALL] Mode: ${args.dryRun ? "DRY_RUN" : args.verify ? "VERIFY" : args.uninstall ? "UNINSTALL" : "INSTALL"}`);
  
  try {
    // Verify mode
    if (args.verify) {
      let allOk = true;
      const clientsToVerify = args.client.length > 0 
        ? args.client 
        : [...MUST_HAVE, ...NICE_TO_HAVE];
      
      for (const client of clientsToVerify) {
        const result = verifyClient(client, manifest);
        if (!result.ok) {
          console.error(`[VERIFY] ✗ ${client}: ${result.error}`);
          allOk = false;
        } else {
          console.log(`[VERIFY] ✓ ${client}: ${result.message}`);
        }
      }
      
      process.exit(allOk ? 0 : 1);
      return;
    }
    
    // Uninstall mode
    if (args.uninstall) {
      if (args.client.length === 0) {
        throw new Error("--uninstall requires --client specification");
      }
      
      let allOk = true;
      for (const client of args.client) {
        const ok = uninstallClient(client, manifest, args);
        if (!ok) allOk = false;
      }
      
      process.exit(allOk ? 0 : 1);
      return;
    }
    
    // Install mode
    
    // 1. Check dependencies
    if (!args.skipDeps && !checkDependencies(manifest, args)) {
      process.exit(1);
      return;
    }
    
    // 2. Determine client list
    let clientsToInstall = args.client;
    if (clientsToInstall.length === 0) {
      console.log("[INSTALL] No clients specified, use --client=<client> or --client=all");
      console.log(`[INSTALL] Supported clients: ${Object.keys(CLIENT_DIRS).join(", ")}`);
      console.log(`[INSTALL] Must-have: ${MUST_HAVE.join(", ")}`);
      console.log(`[INSTALL] Nice-to-have: ${NICE_TO_HAVE.join(", ")}`);
      process.exit(1);
      return;
    }
    
    if (clientsToInstall.includes("all")) {
      clientsToInstall = [...MUST_HAVE, ...NICE_TO_HAVE];
    }
    
    // 3. Validate all clients
    const unknown = clientsToInstall.filter(c => !manifest.targets[c]);
    if (unknown.length > 0) {
      console.error(`[INSTALL] Unknown clients: ${unknown.join(", ")}`);
      process.exit(1);
      return;
    }
    
    // 4. Install each client
    let allOk = true;
    for (const client of clientsToInstall) {
      const ok = installForClient(client, manifest, args);
      if (!ok) allOk = false;
    }
    
    // 5. Post-install summary
    console.log("\n[INSTALL] ================================");
    console.log(`[INSTALL] ${allOk ? "✓" : "✗"} Installation ${allOk ? "complete" : "completed with errors"}`);
    
    if (allOk && !args.dryRun) {
      console.log("\n[INSTALL] Next steps:");
      
      for (const client of clientsToInstall) {
        const targetConfig = manifest.targets[client];
        console.log(`\n  ${client}:`);
        
        if (client === "claude-code") {
          console.log("    → Restart Claude Code if running");
          console.log("    → The plugin will auto-activate on next session");
        } else if (client === "openclaw") {
          console.log("    → Start OpenClaw agent");
          console.log("    → Memory backend is now active");
          console.log("    → First sync may take a minute");
        } else {
          console.log("    → Restart your MCP client");
          console.log("    → Tools should appear automatically");
        }
      }
      
      console.log("\n[INSTALL] Verify with:");
      console.log(`  npx squish-memory install-plugin --client=${clientsToInstall[0]} --verify`);
      console.log("\n[INSTALL] Get help: npx squish-memory install-plugin --help");
    }
    
    process.exit(allOk ? 0 : 1);
    
  } catch (error) {
    console.error("[INSTALL] Fatal error:", error.message);
    process.exit(1);
  }
}

main();
