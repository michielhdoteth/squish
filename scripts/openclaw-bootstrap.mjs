#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const defaultSourceDir = path.join(root, "generated", "mcp");
const defaultTargetDir = path.join(os.homedir(), ".openclaw");

function parseArgs(argv) {
  const args = {
    sourceDir: defaultSourceDir,
    targetDir: defaultTargetDir,
    dryRun: false,
    skipToolCheck: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--skip-tool-check") {
      args.skipToolCheck = true;
      continue;
    }
    if (token === "--source") {
      args.sourceDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--target") {
      args.targetDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function checkBinaryAvailable(binaryName) {
  const run = spawnSync(binaryName, ["--version"], { encoding: "utf8" });
  return run.status === 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function deepMerge(base, overlay) {
  if (Array.isArray(base) || Array.isArray(overlay)) {
    return overlay;
  }
  if (base && typeof base === "object" && overlay && typeof overlay === "object") {
    const out = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      out[key] = key in out ? deepMerge(out[key], value) : value;
    }
    return out;
  }
  return overlay;
}

function backupIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
}

function requireSource(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required source artifact not found: ${filePath}`);
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.skipToolCheck) {
    if (!checkBinaryAvailable("mcporter")) {
      throw new Error("mcporter is not available on PATH");
    }
    if (!checkBinaryAvailable("qmd")) {
      throw new Error("qmd is not available on PATH");
    }
  }

  const mcporterSource = path.join(args.sourceDir, "mcporter.json");
  const openclawSnippetSource = path.join(args.sourceDir, "openclaw-memory-qmd.json");
  requireSource(mcporterSource);
  requireSource(openclawSnippetSource);

  ensureDir(args.targetDir);

  const mcporterTarget = path.join(args.targetDir, "mcporter.json");
  const memoryTarget = path.join(args.targetDir, "openclaw-memory.json");

  if (!args.dryRun) {
    backupIfExists(mcporterTarget);
    fs.copyFileSync(mcporterSource, mcporterTarget);

    const base = fs.existsSync(memoryTarget) ? readJson(memoryTarget) : {};
    const snippet = readJson(openclawSnippetSource);
    const merged = deepMerge(base, snippet);
    backupIfExists(memoryTarget);
    writeJson(memoryTarget, merged);
  }

  const prefix = args.dryRun ? "DRY_RUN" : "BOOTSTRAPPED";
  console.log(`${prefix} mcporter config -> ${mcporterTarget}`);
  console.log(`${prefix} memory config merge -> ${memoryTarget}`);
}

main();
