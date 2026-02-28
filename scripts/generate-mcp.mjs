#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const defaultSourcePath = path.join(root, "config", "mcp.json");
const defaultOutDir = path.join(root, "generated", "mcp");
const defaultImports = [
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "windsurf",
  "opencode",
  "vscode"
];

function parseArgs(argv) {
  const args = {
    configPath: defaultSourcePath,
    outDir: defaultOutDir,
    strictEnv: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--strict-env") {
      args.strictEnv = true;
      continue;
    }
    if (token === "--config") {
      args.configPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--out") {
      args.outDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function sortObjectKeys(input) {
  if (Array.isArray(input)) {
    return input.map(sortObjectKeys);
  }
  if (input && typeof input === "object") {
    const sorted = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortObjectKeys(input[key]);
    }
    return sorted;
  }
  return input;
}

function extractEnvPlaceholders(servers) {
  const placeholders = [];
  for (const [serverName, server] of Object.entries(servers)) {
    const env = server?.env || {};
    for (const [envKey, value] of Object.entries(env)) {
      if (typeof value !== "string") continue;
      const match = value.match(/^\$\{([A-Z0-9_]+)\}$/);
      if (match) {
        placeholders.push({ serverName, envKey, variable: match[1] });
      }
    }
  }
  return placeholders;
}

function validateConfig(config, strictEnv) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config: expected object");
  }

  if (!config.defaults || typeof config.defaults !== "object") {
    throw new Error("Invalid config: defaults must be an object");
  }

  if (!config.servers || typeof config.servers !== "object") {
    throw new Error("Invalid config: servers must be an object");
  }

  const serverNames = Object.keys(config.servers);
  if (serverNames.length === 0) {
    throw new Error("Invalid config: at least one server is required");
  }

  for (const [serverName, server] of Object.entries(config.servers)) {
    if (!server || typeof server !== "object") {
      throw new Error(`Invalid server ${serverName}: expected object`);
    }
    if (!server.command || typeof server.command !== "string") {
      throw new Error(`Invalid server ${serverName}: command is required`);
    }
    if (!Array.isArray(server.args)) {
      throw new Error(`Invalid server ${serverName}: args must be an array`);
    }
    if (!server.transport || typeof server.transport !== "string") {
      throw new Error(`Invalid server ${serverName}: transport is required`);
    }
    if (!server.env || typeof server.env !== "object") {
      throw new Error(`Invalid server ${serverName}: env must be an object`);
    }
  }

  const includeServers = config.includeServers || [];
  if (includeServers.length > 0) {
    const unique = new Set(includeServers);
    if (unique.size !== includeServers.length) {
      throw new Error("Invalid config: includeServers contains duplicates");
    }
    for (const name of includeServers) {
      if (!config.servers[name]) {
        throw new Error(`Invalid config: includeServers references unknown server ${name}`);
      }
    }
  }

  if (strictEnv) {
    const unresolved = extractEnvPlaceholders(config.servers)
      .filter((entry) => !process.env[entry.variable]);
    if (unresolved.length > 0) {
      const first = unresolved[0];
      throw new Error(
        `Missing required env for strict mode: ${first.variable} (server=${first.serverName}, key=${first.envKey})`
      );
    }
  }
}

function selectServers(config) {
  const include = config.includeServers || [];
  if (include.length === 0) {
    return config.servers;
  }
  const selected = {};
  for (const serverName of include) {
    selected[serverName] = config.servers[serverName];
  }
  return selected;
}

function toOpenClawMemoryConfig(runtime) {
  return {
    memory: {
      backend: "qmd",
      qmd: {
        mcporter: {
          enabled: true,
          serverName: "qmd",
          startDaemon: true
        },
        limits: {
          timeoutMs: runtime.requestTimeoutMs,
          maxSnippetChars: runtime.resultMaxChars,
          maxResults: 12
        }
      }
    }
  };
}

function toMcporterConfig(servers) {
  return {
    mcpServers: servers,
    imports: defaultImports
  };
}

function removeLegacyProfileDirectories(outDir) {
  const removed = [];
  if (!fs.existsSync(outDir)) return;
  const entries = fs.readdirSync(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      fs.rmSync(path.join(outDir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}

function main() {
  const args = parseArgs(process.argv);
  const config = readJson(args.configPath);

  validateConfig(config, args.strictEnv);

  ensureDir(args.outDir);
  const removedLegacyDirs = removeLegacyProfileDirectories(args.outDir) || [];

  if (config.profiles && typeof config.profiles === "object") {
    console.warn(
      "[mcp-migration] legacy profiles detected in config/mcp.json and ignored by universal generator"
    );
  }
  if (removedLegacyDirs.length > 0) {
    console.warn(
      `[mcp-migration] removed legacy profile output directories: ${removedLegacyDirs.join(", ")}`
    );
  }

  const runtime = sortObjectKeys(config.defaults);
  const selectedServers = sortObjectKeys(selectServers(config));

  const fileMap = {
    "runtime.json": runtime,
    "mcp-servers.json": { mcpServers: selectedServers },
    "mcporter.json": toMcporterConfig(selectedServers),
    "openclaw-memory-qmd.json": toOpenClawMemoryConfig(runtime)
  };

  for (const [fileName, json] of Object.entries(fileMap)) {
    writeJson(path.join(args.outDir, fileName), json);
  }

  const manifestFiles = Object.keys(fileMap)
    .sort()
    .map((fileName) => {
      const filePath = path.join(args.outDir, fileName);
      return {
        file: fileName,
        sha256: sha256File(filePath)
      };
    });

  const manifest = {
    mode: "universal",
    generatedAt: new Date().toISOString(),
    source: path.relative(root, args.configPath).replace(/\\/g, "/"),
    files: manifestFiles
  };

  writeJson(path.join(args.outDir, "manifest.json"), manifest);
  console.log(`Generated universal MCP artifacts in ${args.outDir}`);
}

main();
