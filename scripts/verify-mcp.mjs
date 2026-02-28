#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const defaultConfigPath = path.join(root, "config", "mcp.json");
const defaultGeneratedDir = path.join(root, "generated", "mcp");
const requiredFiles = [
  "runtime.json",
  "mcp-servers.json",
  "mcporter.json",
  "openclaw-memory-qmd.json",
  "manifest.json"
];

function parseArgs(argv) {
  const args = {
    configPath: defaultConfigPath,
    generatedDir: defaultGeneratedDir,
    checkReproducibility: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      args.configPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--generated") {
      args.generatedDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--no-repro") {
      args.checkReproducibility = false;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON at ${filePath}: ${String(error)}`);
  }
}

function checksum(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function assertServerShape(serverName, server) {
  if (!server || typeof server !== "object") {
    fail(`Server ${serverName} must be an object`);
  }
  if (typeof server.command !== "string" || server.command.length === 0) {
    fail(`Server ${serverName} must include command`);
  }
  if (!Array.isArray(server.args)) {
    fail(`Server ${serverName} must include args array`);
  }
  if (typeof server.transport !== "string" || server.transport.length === 0) {
    fail(`Server ${serverName} must include transport`);
  }
  if (!server.env || typeof server.env !== "object") {
    fail(`Server ${serverName} must include env object`);
  }
}

function verifyGeneratedFiles(dirPath) {
  for (const fileName of requiredFiles) {
    const filePath = path.join(dirPath, fileName);
    if (!fs.existsSync(filePath)) {
      fail(`Missing generated file: ${fileName}`);
    }
  }
}

function verifyRuntime(runtime) {
  const requiredKeys = [
    "connectionTimeoutMs",
    "requestTimeoutMs",
    "maxConcurrentToolCalls",
    "lazyToolDiscovery",
    "resultMaxChars",
    "retry"
  ];
  for (const key of requiredKeys) {
    if (!(key in runtime)) {
      fail(`runtime.json missing required key: ${key}`);
    }
  }
}

function verifyManifest(manifest, dirPath) {
  if (manifest.mode !== "universal") {
    fail("manifest mode must be universal");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("manifest files must be a non-empty array");
  }

  const expectedManifestEntries = [
    "runtime.json",
    "mcp-servers.json",
    "mcporter.json",
    "openclaw-memory-qmd.json"
  ];

  for (const fileName of expectedManifestEntries) {
    const entry = manifest.files.find((item) => item.file === fileName);
    if (!entry) {
      fail(`manifest missing entry for ${fileName}`);
    }
    const actualHash = checksum(path.join(dirPath, fileName));
    if (entry.sha256 !== actualHash) {
      fail(`manifest checksum mismatch for ${fileName}`);
    }
  }
}

function verifyReproducibility(configPath, dirPath) {
  const first = readJson(path.join(dirPath, "manifest.json"));
  const firstChecksums = new Map(first.files.map((item) => [item.file, item.sha256]));

  const run = spawnSync(
    process.execPath,
    ["scripts/generate-mcp.mjs", "--config", configPath, "--out", dirPath],
    { cwd: root, encoding: "utf8" }
  );

  if (run.status !== 0) {
    fail(`Reproducibility generation failed: ${run.stderr || run.stdout}`);
  }

  const second = readJson(path.join(dirPath, "manifest.json"));
  const secondChecksums = new Map(second.files.map((item) => [item.file, item.sha256]));

  for (const [fileName, firstHash] of firstChecksums.entries()) {
    const secondHash = secondChecksums.get(fileName);
    if (!secondHash) {
      fail(`Reproducibility check missing ${fileName} in second manifest`);
    }
    if (firstHash !== secondHash) {
      fail(`Reproducibility mismatch for ${fileName}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.configPath)) {
    fail(`Config file not found: ${args.configPath}`);
  }
  if (!fs.existsSync(args.generatedDir)) {
    fail(`Generated directory not found: ${args.generatedDir}`);
  }

  verifyGeneratedFiles(args.generatedDir);

  const runtime = readJson(path.join(args.generatedDir, "runtime.json"));
  verifyRuntime(runtime);

  const mcpServers = readJson(path.join(args.generatedDir, "mcp-servers.json"));
  if (!mcpServers.mcpServers || typeof mcpServers.mcpServers !== "object") {
    fail("mcp-servers.json must include mcpServers object");
  }
  const serverEntries = Object.entries(mcpServers.mcpServers);
  if (serverEntries.length === 0) {
    fail("mcp-servers.json must include at least one server");
  }
  for (const [name, server] of serverEntries) {
    assertServerShape(name, server);
  }

  const mcporter = readJson(path.join(args.generatedDir, "mcporter.json"));
  if (!Array.isArray(mcporter.imports) || mcporter.imports.length === 0) {
    fail("mcporter.json must include imports array");
  }
  if (!mcporter.mcpServers || typeof mcporter.mcpServers !== "object") {
    fail("mcporter.json must include mcpServers object");
  }

  const openclaw = readJson(path.join(args.generatedDir, "openclaw-memory-qmd.json"));
  if (openclaw?.memory?.backend !== "qmd") {
    fail("openclaw-memory-qmd.json must set memory.backend=qmd");
  }

  const manifest = readJson(path.join(args.generatedDir, "manifest.json"));
  verifyManifest(manifest, args.generatedDir);

  if (args.checkReproducibility) {
    verifyReproducibility(args.configPath, args.generatedDir);
  }

  console.log("MCP verification passed");
}

main();
