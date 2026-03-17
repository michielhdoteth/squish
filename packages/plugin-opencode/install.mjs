#!/usr/bin/env node

/**
 * OpenCode Plugin Installer for Squish
 * Auto-installs CLI + configures OpenCode to use Squish as MCP server
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSquishMcpConfig() {
  return {
    type: "local",
    command: ["squish-mcp"],
    enabled: true,
    environment: {}
  };
}

function loadOpenCodeConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`[ERROR] Failed to parse OpenCode config: ${error.message}`);
    return null;
  }
}

function saveOpenCodeConfig(config) {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function createNewConfig() {
  return {
    $schema: OPENCODE_SCHEMA,
    mcp: {
      squish: getSquishMcpConfig()
    }
  };
}

function installForOpenCode(options = {}) {
  console.log("[INSTALL] Installing Squish for OpenCode...");
  
  let config = loadOpenCodeConfig();
  let created = false;
  
  if (!config) {
    if (options.dryRun) {
      console.log("[DRY-RUN] Would create new OpenCode config at:", CONFIG_PATH);
      return true;
    }
    
    config = createNewConfig();
    created = true;
    console.log("[INSTALL] Created new OpenCode config");
  } else {
    if (options.dryRun) {
      console.log("[DRY-RUN] Would update existing OpenCode config at:", CONFIG_PATH);
      return true;
    }
    
    // Ensure mcp section exists
    if (!config.mcp) {
      config.mcp = {};
    }
    
    // Add or update squish MCP config
    config.mcp.squish = getSquishMcpConfig();
    console.log("[INSTALL] Updated existing OpenCode config");
  }
  
  saveOpenCodeConfig(config);
  console.log(`[INSTALL] ${created ? 'Created' : 'Updated'}: ${CONFIG_PATH}`);
  
  return true;
}

function uninstallForOpenCode(options = {}) {
  console.log("[UNINSTALL] Removing Squish from OpenCode...");
  
  const config = loadOpenCodeConfig();
  if (!config) {
    console.log("[UNINSTALL] No OpenCode config found");
    return true;
  }
  
  if (!config.mcp || !config.mcp.squish) {
    console.log("[UNINSTALL] Squish not found in OpenCode config");
    return true;
  }
  
  if (options.dryRun) {
    console.log("[DRY-RUN] Would remove Squish from OpenCode config");
    return true;
  }
  
  delete config.mcp.squish;
  
  // Clean up empty mcp section
  if (Object.keys(config.mcp).length === 0) {
    delete config.mcp;
  }
  
  saveOpenCodeConfig(config);
  console.log("[UNINSTALL] Removed Squish from OpenCode config");
  
  return true;
}

function verifyOpenCodeInstallation() {
  console.log("[VERIFY] Checking OpenCode installation...");
  
  const config = loadOpenCodeConfig();
  if (!config) {
    return { ok: false, error: "OpenCode config not found" };
  }
  
  if (!config.mcp || !config.mcp.squish) {
    return { ok: false, error: "Squish MCP not configured" };
  }
  
  const squishConfig = config.mcp.squish;
  
  if (squishConfig.type !== "local") {
    return { ok: false, error: `Expected type 'local', got '${squishConfig.type}'` };
  }
  
  if (!squishConfig.enabled) {
    return { ok: false, error: "Squish MCP is disabled" };
  }
  
  // Check if squish-mcp command is available
  const result = spawnSync("which", ["squish-mcp"], { encoding: "utf8", shell: true });
  if (result.status !== 0) {
    return { ok: false, error: "squish-mcp command not found in PATH" };
  }
  
  console.log("[VERIFY] OpenCode config:", CONFIG_PATH);
  console.log("[VERIFY] Squish MCP configured:", squishConfig.command.join(" "));
  console.log("[VERIFY] Status: enabled");
  
  return { ok: true, message: "OpenCode installation verified" };
}

function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes("--dry-run") || args.includes("-d"),
    uninstall: args.includes("--uninstall") || args.includes("-u"),
    verify: args.includes("--verify") || args.includes("-v")
  };
  
  console.log("[OpenCode Plugin for Squish]");
  console.log();
  
  try {
    if (options.verify) {
      const result = verifyOpenCodeInstallation();
      if (result.ok) {
        console.log("\n[VERIFY] " + result.message);
        process.exit(0);
      } else {
        console.error("\n[VERIFY] Failed:", result.error);
        process.exit(1);
      }
    }
    
    if (options.uninstall) {
      const success = uninstallForOpenCode(options);
      process.exit(success ? 0 : 1);
    }
    
    const success = installForOpenCode(options);
    
    if (success && !options.dryRun) {
      const verify = verifyOpenCodeInstallation();
      if (verify.ok) {
        console.log("\n[SUCCESS] OpenCode plugin installed successfully!");
        console.log("\nTo use Squish in OpenCode:");
        console.log("  1. Restart OpenCode if it's running");
        console.log("  2. Start a conversation and ask about memories");
        console.log("  3. Or explicitly: 'use the squish tool to search for...'");
      } else {
        console.error("\n[WARNING] Installation succeeded but verification failed:");
        console.error("  ", verify.error);
      }
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error("[ERROR]", error.message);
    process.exit(1);
  }
}

main();
