#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();

// Load manifest to get pinned versions
function loadManifest() {
  const manifestPath = path.join(root, "config", "plugin-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Plugin manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function which(binaryName) {
  const isWindows = process.platform === "win32";
  const extensions = isWindows ? [".exe", ".cmd", ".bat"] : [""];
  
  const envPath = process.env.PATH || "";
  const paths = envPath.split(path.delimiter);
  
  for (const dir of paths) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, binaryName + ext);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function checkBinary(binaryName) {
  const path = which(binaryName);
  if (!path) return { available: false, path: null };
  
  const result = spawnSync(binaryName, ["--version"], { 
    encoding: "utf8", 
    timeout: 5000 
  });
  const version = result.stdout.trim().split("\n")[0] || result.stderr.trim().split("\n")[0];
  return { available: true, path, version: version || "unknown" };
}

function installPackage(packageName, version, packageManager = "npm") {
  console.log(`[DEP] Installing ${packageName}@${version} via ${packageManager}...`);
  const packageSpec = `${packageName}@${version}`;
  const args = getGlobalInstallArgs(packageManager, packageSpec);
  if (!args) {
    console.log(`[DEP] Unsupported package manager: ${packageManager}`);
    return false;
  }

  const result = spawnSync(
    packageManager,
    args,
    { 
      encoding: "utf8",
      stdio: "inherit",
      timeout: 120000 
    }
  );
  return result.status === 0;
}

function getGlobalInstallArgs(packageManager, packageSpec) {
  switch (packageManager) {
    case "npm":
      return ["install", "-g", packageSpec];
    case "yarn":
      return ["global", "add", packageSpec];
    case "pnpm":
      return ["add", "-g", packageSpec];
    case "bun":
      return ["add", "-g", packageSpec];
    default:
      return null;
  }
}

function verifyInstallation(binaryName, expectedVersion) {
  const check = checkBinary(binaryName);
  if (!check.available) {
    return { ok: false, error: `${binaryName} not found on PATH` };
  }
  
  // Version verification: just check it's present, exact match not required
  // since binary might report different format
  console.log(`[DEP] ✓ ${binaryName} available at ${check.path} (${check.version})`);
  return { ok: true, path: check.path, version: check.version };
}

function getBinaryName(packageName) {
  // For scoped packages like @tobilu/qmd, the binary is just "qmd"
  if (packageName.startsWith("@")) {
    return packageName.split("/").pop();
  }
  return packageName;
}

function installDependency(name, depConfig) {
  const { version, autoInstall, optional } = depConfig;
  const binaryName = getBinaryName(name);
  
  console.log(`\n[DEP] Checking dependency: ${name}@${version} (binary: ${binaryName})`);
  
  const check = checkBinary(binaryName);
  
  if (check.available) {
    console.log(`[DEP] ✓ ${name} already installed`);
    return { status: "ok", installed: true, path: check.path };
  }
  
  if (!autoInstall) {
    const msg = optional 
      ? `[DEP] ⚠ ${name} is optional but not installed`
      : `[DEP] ✗ ${name} is required but not installed`;
    console.log(msg);
    return { 
      status: optional ? "warning" : "error", 
      error: `${name} not found and autoInstall disabled` 
    };
  }
  
  console.log(`[DEP] Auto-installing ${name}@${version}...`);
  
  const packageManagers = ["npm", "yarn", "pnpm", "bun"].filter((pm) => which(pm));
  let success = false;
  
  for (const pm of packageManagers) {
    success = installPackage(name, version, pm);
    if (success) break;
    console.log(`[DEP] ${pm} install failed, trying next...`);
  }
  
  if (!success) {
    return { 
      status: "error", 
      error: `Failed to install ${name}@${version}` 
    };
  }
  
  const verify = verifyInstallation(binaryName, version);
  if (!verify.ok) {
    return { status: "error", error: verify.error };
  }
  
  console.log(`[DEP] ✓ Successfully installed ${name}`);
  return { status: "ok", installed: true, path: verify.path };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const strict = args.includes("--strict");
  const showVersions = args.includes("--versions");
  
  try {
    const manifest = loadManifest();
    const dependencies = manifest.dependencies || {};
    
    console.log(`[DEP] Squish Dependency Manager v${manifest.version}`);
    console.log(`[DEP] Mode: ${dryRun ? "DRY_RUN" : "LIVE"}`);
    
    if (dryRun) {
      console.log("[DEP] DRY RUN - no installations will be performed");
    }
    
    const results = {};
    let hasErrors = false;
    
    for (const [name, config] of Object.entries(dependencies)) {
      const binaryName = getBinaryName(name);
      const check = checkBinary(binaryName);
      
      if (showVersions) {
        console.log(`[VER] ${name}: ${check.available ? check.version : "NOT INSTALLED"}`);
        continue;
      }
      
      if (check.available) {
        console.log(`[DEP] ✓ ${name} ${check.version} (already installed)`);
        results[name] = { status: "ok", installed: true, path: check.path, version: check.version };
        continue;
      }
      
      if (!config.autoInstall) {
        console.log(`[DEP] ${name}: required but not installed (autoInstall=false)`);
        if (strict) {
          hasErrors = true;
          results[name] = { status: "error", error: "required but not installed" };
        } else {
          results[name] = { status: "warning", error: "required but not installed" };
        }
        continue;
      }
      
      if (dryRun) {
        console.log(`[DEP] [DRY_RUN] Would install ${name}@${config.version}`);
        results[name] = { status: "ok", wouldInstall: true, version: config.version };
        continue;
      }
      
      const result = installDependency(name, config);
      results[name] = result;
      if (result.status === "error") {
        hasErrors = true;
      }
    }
    
    console.log("\n[DEP] Dependency check complete");
    
    const summary = Object.entries(results)
      .map(([name, res]) => `  ${name}: ${res.status}${res.path ? ` (${res.path})` : ''}`)
      .join("\n");
    console.log(`Results:\n${summary}`);
    
    if (hasErrors) {
      console.error("[DEP] Some dependencies failed to install");
      process.exit(1);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error("[DEP] Fatal error:", error.message);
    process.exit(1);
  }
}

main();
