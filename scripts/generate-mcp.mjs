#!/usr/bin/env node

/**
 * Generate Universal MCP Artifacts
 * 
 * Usage:
 *   node scripts/generate-mcp.mjs --config <mcp.json> --out <output-dir>
 *   node scripts/generate-mcp.mjs --config <mcp.json> --out <output-dir> --strict-env
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = args[args.indexOf('--config') + 1];
  const out = args[args.indexOf('--out') + 1];
  const strictEnv = args.includes('--strict-env');
  
  if (!config || !out) {
    console.error('Usage: generate-mcp.mjs --config <mcp.json> --out <output-dir> [--strict-env]');
    process.exit(1);
  }
  
  return { config, out, strictEnv };
}

function loadConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`Failed to load config: ${error.message}`);
    process.exit(1);
  }
}

function checkStrictEnv(config, strictEnv) {
  if (!strictEnv) return;
  
  const unresolved = [];
  for (const [serverName, server] of Object.entries(config.servers || {})) {
    for (const [key, value] of Object.entries(server.env || {})) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        unresolved.push(`${serverName}.env.${key}`);
      }
    }
  }
  
  if (unresolved.length > 0) {
    console.error(`Missing required env for strict mode: ${unresolved.join(', ')}`);
    process.exit(1);
  }
}

function removeLegacyProfiles(outDir) {
  const entries = fs.readdirSync(outDir, { withFileTypes: true });
  const profileDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  if (profileDirs.length > 0) {
    console.error(`legacy profiles detected: ${profileDirs.join(', ')}`);
    for (const dir of profileDirs) {
      fs.rmSync(path.join(outDir, dir), { recursive: true, force: true });
    }
    console.error(`removed legacy profile output directories: ${profileDirs.join(', ')}`);
  }
}

function generateUniversalArtifacts(config, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  
  // Remove legacy profiles if they exist
  removeLegacyProfiles(outDir);
  
  // Generate mcp-servers.json
  const mcpServers = {};
  for (const [name, server] of Object.entries(config.servers || {})) {
    mcpServers[name] = {
      command: server.command,
      args: server.args || [],
      env: server.env || {}
    };
  }
  
  const mcpServersPath = path.join(outDir, 'mcp-servers.json');
  fs.writeFileSync(mcpServersPath, JSON.stringify({ mcpServers }, null, 2) + '\n');
  
  // Generate mcporter.json (OpenClaw format)
  const mcporter = {
    mcpServers: {}
  };
  for (const [name, server] of Object.entries(config.servers || {})) {
    mcporter.mcpServers[name] = {
      command: server.command,
      args: server.args || [],
      env: server.env || {}
    };
  }
  
  const mcporterPath = path.join(outDir, 'mcporter.json');
  fs.writeFileSync(mcporterPath, JSON.stringify(mcporter, null, 2) + '\n');
  
  // Generate openclaw-memory-qmd.json
  const openclaw = {
    type: 'local',
    command: ['squish-mcp', '--stdio'],
    environment: {
      SQUISH_MODE: 'local',
      SQUISH_DATA_DIR: '~/.squish/openclaw'
    },
    enabled: true
  };
  
  const openclawPath = path.join(outDir, 'openclaw-memory-qmd.json');
  fs.writeFileSync(openclawPath, JSON.stringify(openclaw, null, 2) + '\n');
  
  // Generate runtime.json
  const runtime = {
    requestTimeoutMs: config.defaults?.requestTimeoutMs || 60000,
    resultMaxChars: config.defaults?.resultMaxChars || 12000,
    maxConcurrentToolCalls: config.defaults?.maxConcurrentToolCalls || 4
  };
  
  const runtimePath = path.join(outDir, 'runtime.json');
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2) + '\n');
  
  // Generate manifest.json
  const manifest = {
    mode: 'universal',
    version: config.version || 1,
    files: [
      'mcp-servers.json',
      'mcporter.json',
      'openclaw-memory-qmd.json',
      'runtime.json'
    ],
    generatedAt: new Date().toISOString()
  };
  
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  
  console.log('Generated universal MCP artifacts');
}

function main() {
  const { config: configPath, out: outDir, strictEnv } = parseArgs();
  const config = loadConfig(configPath);
  
  checkStrictEnv(config, strictEnv);
  generateUniversalArtifacts(config, outDir);
}

main();
