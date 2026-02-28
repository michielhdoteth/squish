#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const defaultSourceDir = path.join(root, "generated", "mcp");

const clientDefaultDirs = {
  "claude-code": path.join(os.homedir(), ".claude"),
  opencode: path.join(os.homedir(), ".config", "opencode"),
  codex: path.join(os.homedir(), ".codex"),
  cursor: path.join(os.homedir(), ".cursor"),
  vscode: path.join(os.homedir(), ".vscode", "mcp"),
  windsurf: path.join(os.homedir(), ".windsurf"),
  openclaw: path.join(os.homedir(), ".openclaw")
};

function parseArgs(argv) {
  const args = {
    client: "",
    sourceDir: defaultSourceDir,
    targetDir: "",
    dryRun: false,
    backup: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--no-backup") {
      args.backup = false;
      continue;
    }
    if (token === "--client") {
      args.client = argv[i + 1];
      i += 1;
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

  if (!args.client) {
    throw new Error("Missing required argument: --client");
  }
  if (!clientDefaultDirs[args.client]) {
    throw new Error(`Unsupported client: ${args.client}`);
  }
  if (!args.targetDir) {
    args.targetDir = clientDefaultDirs[args.client];
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function backupFile(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.copyFileSync(targetPath, `${targetPath}.bak`);
}

function copyFile(sourcePath, targetPath, options) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }
  if (options.backup) {
    backupFile(targetPath);
  }
  if (!options.dryRun) {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function filePlanForClient(client) {
  if (client === "openclaw") {
    return [
      { from: "mcporter.json", to: "mcporter.json" },
      { from: "openclaw-memory-qmd.json", to: "openclaw-memory-qmd.json" }
    ];
  }
  return [{ from: "mcp-servers.json", to: "mcp-servers.json" }];
}

function main() {
  const args = parseArgs(process.argv);
  const plan = filePlanForClient(args.client);

  ensureDir(args.targetDir);

  for (const item of plan) {
    const sourcePath = path.join(args.sourceDir, item.from);
    const targetPath = path.join(args.targetDir, item.to);
    copyFile(sourcePath, targetPath, args);
    const modeTag = args.dryRun ? "DRY_RUN" : "INSTALLED";
    console.log(`${modeTag} ${item.from} -> ${targetPath}`);
  }
}

main();
