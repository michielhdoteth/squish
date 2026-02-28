#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "config", "remote-memory-policy.json");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function warn(message) {
  process.stderr.write(`[warn] ${message}\n`);
}

function readPolicy() {
  if (!fs.existsSync(policyPath)) {
    fail(`Missing policy file: ${policyPath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(policyPath, "utf8"));
  } catch (error) {
    fail(`Invalid policy JSON: ${String(error)}`);
  }
}

function main() {
  const policy = readPolicy();
  const required = Array.isArray(policy.requiredEnv) ? policy.requiredEnv : [];

  const missing = required.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    fail(`Remote preflight failed: missing required env vars: ${missing.join(", ")}`);
  }

  const provider = process.env.SQUISH_EMBEDDINGS_PROVIDER || "local";
  if (!["local", "openai", "ollama", "none", "hybrid", "qmd"].includes(provider)) {
    fail(`Remote preflight failed: invalid SQUISH_EMBEDDINGS_PROVIDER='${provider}'`);
  }

  if (provider === "openai" && !process.env.SQUISH_OPENAI_API_KEY) {
    warn("SQUISH_EMBEDDINGS_PROVIDER=openai but SQUISH_OPENAI_API_KEY is missing");
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      mode: "remote",
      requiredEnvChecked: required,
      embeddingsProvider: provider,
      memoryPolicyVersion: policy.version
    })}\n`
  );
}

main();
