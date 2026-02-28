import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("openclaw-bootstrap", () => {
  it("supports dry-run without writing files", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-oc-bootstrap-dry-"));
    const sourceDir = join(root, "source");
    const targetDir = join(root, "target");
    mkdirSync(sourceDir, { recursive: true });

    writeFileSync(join(sourceDir, "mcporter.json"), '{"mcpServers":{}}\n');
    writeFileSync(join(sourceDir, "openclaw-memory-qmd.json"), '{"memory":{"backend":"qmd"}}\n');

    const run = spawnSync(
      process.execPath,
      [
        "scripts/openclaw-bootstrap.mjs",
        "--source",
        sourceDir,
        "--target",
        targetDir,
        "--skip-tool-check",
        "--dry-run"
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("DRY_RUN");
    expect(existsSync(join(targetDir, "mcporter.json"))).toBe(false);
    expect(existsSync(join(targetDir, "openclaw-memory.json"))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("merges openclaw memory snippet safely", () => {
    const root = mkdtempSync(join(tmpdir(), "squish-oc-bootstrap-"));
    const sourceDir = join(root, "source");
    const targetDir = join(root, "target");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });

    writeFileSync(join(sourceDir, "mcporter.json"), '{"mcpServers":{"qmd":{"command":"qmd"}}}\n');
    writeFileSync(
      join(sourceDir, "openclaw-memory-qmd.json"),
      '{"memory":{"backend":"qmd","qmd":{"limits":{"timeoutMs":60000}}}}\n'
    );
    writeFileSync(join(targetDir, "openclaw-memory.json"), '{"memory":{"citations":"auto"}}\n');

    const run = spawnSync(
      process.execPath,
      [
        "scripts/openclaw-bootstrap.mjs",
        "--source",
        sourceDir,
        "--target",
        targetDir,
        "--skip-tool-check"
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("BOOTSTRAPPED");

    const merged = readJson(join(targetDir, "openclaw-memory.json"));
    expect(merged.memory.citations).toBe("auto");
    expect(merged.memory.backend).toBe("qmd");
    expect(merged.memory.qmd.limits.timeoutMs).toBe(60000);

    rmSync(root, { recursive: true, force: true });
  });
});
