#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const policyPath = path.join(root, "config", "mcp-cli-fallback-policy.json");

function parseArgs(argv) {
  const args = {
    op: "",
    payload: "",
    dryRun: false,
    simulateMcpFailure: false,
    mcpEnabled: process.env.SQUISH_MCP_ENABLED === "true"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--op") {
      args.op = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--payload") {
      args.payload = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--simulate-mcp-failure") {
      args.simulateMcpFailure = true;
      continue;
    }
    if (token === "--mcp-enabled") {
      args.mcpEnabled = true;
      continue;
    }
    if (token === "--no-mcp") {
      args.mcpEnabled = false;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.op) {
    throw new Error("Missing required argument: --op");
  }
  return args;
}

function readPolicy() {
  return JSON.parse(fs.readFileSync(policyPath, "utf8"));
}

function assertAllowed(policy, op, payload) {
  if (!policy.allowOperations.includes(op)) {
    throw new Error(`Operation not allowed by fallback policy: ${op}`);
  }
  for (const pattern of policy.denyPatterns) {
    const rx = new RegExp(pattern, "i");
    if (rx.test(payload)) {
      throw new Error(`Payload blocked by fallback deny pattern: ${pattern}`);
    }
  }
}

function output(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function runCliFallback(op, payload, dryRun) {
  if (dryRun) {
    return { success: true, executionPath: "cli-fallback", op, dryRun };
  }

  const args = [op];
  if (payload && payload.trim().length > 0) {
    args.push(payload);
  }

  const run = spawnSync("squish", args, { encoding: "utf8" });
  if (run.status !== 0) {
    return {
      success: false,
      executionPath: "cli-fallback",
      op,
      error: run.stderr || run.stdout || "squish command failed"
    };
  }

  return {
    success: true,
    executionPath: "cli-fallback",
    op,
    output: run.stdout.trim()
  };
}

function runMcp(op, dryRun) {
  if (dryRun) {
    return { success: true, executionPath: "mcp", op, dryRun };
  }

  return {
    success: true,
    executionPath: "mcp",
    op,
    output: "MCP call path selected"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const policy = readPolicy();

  assertAllowed(policy, args.op, args.payload);

  const shouldFallback = !args.mcpEnabled || args.simulateMcpFailure;
  const result = shouldFallback
    ? runCliFallback(args.op, args.payload, args.dryRun)
    : runMcp(args.op, args.dryRun);

  output(result);
  process.exit(result.success ? 0 : 1);
}

main();
