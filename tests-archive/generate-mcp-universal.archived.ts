import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("generate-mcp universal", () => {
  it("generates a single universal artifact set with manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-gen-"));
    const configDir = join(root, "config");
    const outDir = join(root, "generated", "mcp");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
      join(configDir, "mcp.json"),
      JSON.stringify({
        version: 1,
        defaults: {
          requestTimeoutMs: 60000,
          resultMaxChars: 12000
        },
        servers: {
          filesystem: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
            env: {}
          }
        },
        profiles: {
          default: {
            includeServers: ["filesystem"],
            runtimeOverrides: {}
          }
        }
      })
    );

    mkdirSync(join(outDir, "default"), { recursive: true });
    writeFileSync(join(outDir, "default", "stale.json"), "{}\n");

    const run = spawnSync(
      process.execPath,
      ["scripts/generate-mcp.mjs", "--config", join(configDir, "mcp.json"), "--out", outDir],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(run.status).toBe(0);
    expect(run.stderr).toContain("legacy profiles detected");
    expect(run.stderr).toContain("removed legacy profile output directories: default");
    expect(run.stdout).toContain("Generated universal MCP artifacts");

    const entries = readdirSync(outDir).sort();
    expect(entries).toEqual([
      "manifest.json",
      "mcp-servers.json",
      "mcporter.json",
      "openclaw-memory-qmd.json",
      "runtime.json"
    ]);

    expect(statSync(join(outDir, "runtime.json")).isFile()).toBe(true);
    expect(existsSync(join(outDir, "default"))).toBe(false);

    const manifest = readJson(join(outDir, "manifest.json"));
    expect(manifest.mode).toBe("universal");
    expect(manifest.files.length).toBe(4);

    rmSync(root, { recursive: true, force: true });
  });

  it("fails in strict env mode when required env placeholders are unresolved", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-gen-strict-"));
    const configDir = join(root, "config");
    const outDir = join(root, "generated", "mcp");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
      join(configDir, "mcp.json"),
      JSON.stringify({
        version: 1,
        defaults: {
          requestTimeoutMs: 60000,
          resultMaxChars: 12000
        },
        servers: {
          github: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}"
            }
          }
        }
      })
    );

    const run = spawnSync(
      process.execPath,
      [
        "scripts/generate-mcp.mjs",
        "--config",
        join(configDir, "mcp.json"),
        "--out",
        outDir,
        "--strict-env"
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: "" } }
    );

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Missing required env for strict mode");

    rmSync(root, { recursive: true, force: true });
  });
});
