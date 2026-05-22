import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

function run(args: string[]) {
  return spawnSync(process.execPath, ["scripts/squish-fallback.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

describe("squish-fallback policy", () => {
  it("uses mcp path when mcp is enabled", () => {
    const out = run(["--op", "search", "--mcp-enabled", "--dry-run"]);
    expect(out.status).toBe(0);
    const json = JSON.parse(out.stdout.trim());
    expect(json.executionPath).toBe("mcp");
  });

  it("falls back to cli when mcp fails", () => {
    const out = run(["--op", "search", "--simulate-mcp-failure", "--dry-run"]);
    expect(out.status).toBe(0);
    const json = JSON.parse(out.stdout.trim());
    expect(json.executionPath).toBe("cli-fallback");
  });

  it("rejects disallowed operations", () => {
    const out = run(["--op", "docker", "--dry-run"]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain("Operation not allowed");
  });

  it("blocks dangerous payload patterns", () => {
    const out = run(["--op", "search", "--payload", "hello && docker ps", "--dry-run"]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain("Payload blocked");
  });
});
