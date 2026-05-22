import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("verify-mcp", () => {
  it("passes on generated universal artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-verify-pass-"));
    const configDir = join(root, "config");
    const generatedDir = join(root, "generated", "mcp");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
      join(configDir, "mcp.json"),
      JSON.stringify({
        version: 1,
        defaults: {
          connectionTimeoutMs: 15000,
          requestTimeoutMs: 60000,
          maxConcurrentToolCalls: 4,
          retry: { enabled: true, maxAttempts: 3, backoffMs: 400 },
          lazyToolDiscovery: true,
          resultMaxChars: 12000
        },
        servers: {
          filesystem: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
            env: {}
          }
        }
      })
    );

    const gen = spawnSync(
      process.execPath,
      ["scripts/generate-mcp.mjs", "--config", join(configDir, "mcp.json"), "--out", generatedDir],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(gen.status).toBe(0);

    const verify = spawnSync(
      process.execPath,
      ["scripts/verify-mcp.mjs", "--config", join(configDir, "mcp.json"), "--generated", generatedDir],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(verify.status).toBe(0);
    expect(verify.stdout).toContain("MCP verification passed");

    rmSync(root, { recursive: true, force: true });
  });

  it("fails when checksum is invalid", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-verify-fail-"));
    const configDir = join(root, "config");
    const generatedDir = join(root, "generated", "mcp");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
      join(configDir, "mcp.json"),
      JSON.stringify({
        version: 1,
        defaults: {
          connectionTimeoutMs: 15000,
          requestTimeoutMs: 60000,
          maxConcurrentToolCalls: 4,
          retry: { enabled: true, maxAttempts: 3, backoffMs: 400 },
          lazyToolDiscovery: true,
          resultMaxChars: 12000
        },
        servers: {
          filesystem: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
            env: {}
          }
        }
      })
    );

    const gen = spawnSync(
      process.execPath,
      ["scripts/generate-mcp.mjs", "--config", join(configDir, "mcp.json"), "--out", generatedDir],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(gen.status).toBe(0);

    const runtimePath = join(generatedDir, "runtime.json");
    const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
    runtime.resultMaxChars = 42;
    writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`);

    const verify = spawnSync(
      process.execPath,
      ["scripts/verify-mcp.mjs", "--config", join(configDir, "mcp.json"), "--generated", generatedDir],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toContain("manifest checksum mismatch for runtime.json");

    rmSync(root, { recursive: true, force: true });
  });
});
