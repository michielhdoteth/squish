import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("install-mcp", () => {
  it("supports dry-run without writing files", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-install-dry-"));
    const sourceDir = join(root, "source");
    const targetDir = join(root, "target");
    mkdirSync(sourceDir, { recursive: true });

    writeFileSync(join(sourceDir, "mcp-servers.json"), "{\"mcpServers\":{}}\n");

    const run = spawnSync(
      process.execPath,
      [
        "scripts/install-mcp.mjs",
        "--client",
        "claude-code",
        "--source",
        sourceDir,
        "--target",
        targetDir,
        "--dry-run"
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("DRY_RUN");
    expect(existsSync(join(targetDir, "mcp-servers.json"))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("installs mcp-servers.json for claude-code", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-mcp-install-"));
    const sourceDir = join(root, "source");
    const targetDir = join(root, "target");
    mkdirSync(sourceDir, { recursive: true });

    const payload = '{"mcpServers":{"filesystem":{"command":"npx","args":["-y"]}}}\n';
    writeFileSync(join(sourceDir, "mcp-servers.json"), payload);

    const run = spawnSync(
      process.execPath,
      [
        "scripts/install-mcp.mjs",
        "--client",
        "claude-code",
        "--source",
        sourceDir,
        "--target",
        targetDir
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("INSTALLED");
    expect(readFileSync(join(targetDir, "mcp-servers.json"), "utf8")).toBe(payload);

    rmSync(root, { recursive: true, force: true });
  });
});
