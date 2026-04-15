#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

function detectClient(client) {
  const dir = CLIENT_DIRS[client];
  if (!dir) return false;
  
  try {
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const json = args.includes("--json");
  
  const results = {};
  
  if (all) {
    for (const client of Object.keys(CLIENT_DIRS)) {
      results[client] = detectClient(client);
    }
  } else {
    const clientsToCheck = args.length > 0 ? args : Object.keys(CLIENT_DIRS);
    for (const client of clientsToCheck) {
      if (CLIENT_DIRS[client]) {
        results[client] = detectClient(client);
      } else {
        results[client] = false;
      }
    }
  }
  
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("\nClient Detection Results:");
    console.log("========================\n");
    
    const detected = Object.entries(results).filter(([_, present]) => present);
    const notDetected = Object.entries(results).filter(([_, present]) => !present);
    
    if (detected.length > 0) {
      console.log("Detected clients:");
      for (const [client] of detected) {
        console.log(`  ✓ ${client} (${CLIENT_DIRS[client]})`);
      }
    }
    
    if (notDetected.length > 0) {
      console.log("\nNot detected:");
      for (const [client] of notDetected) {
        console.log(`  ✗ ${client} (expected at ${CLIENT_DIRS[client]})`);
      }
    }
    
    console.log("\nSummary:", detected.length, "detected,", notDetected.length, "missing");
  }
}

main();
