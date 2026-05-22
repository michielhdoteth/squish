import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

function run(env = {}) {
  return spawnSync(process.execPath, ["scripts/remote-preflight.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

describe("remote preflight", () => {
  it("fails when required env vars are missing", () => {
    const out = run({ DATABASE_URL: "", REDIS_URL: "", SQUISH_REMOTE_TOKEN: "" });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain("missing required env vars");
  });

  it("passes when required env vars are present", () => {
    const out = run({
      DATABASE_URL: "postgres://example",
      REDIS_URL: "redis://example",
      SQUISH_REMOTE_TOKEN: "token",
      SQUISH_EMBEDDINGS_PROVIDER: "local"
    });
    expect(out.status).toBe(0);
    const result = JSON.parse(out.stdout.trim());
    expect(result.success).toBe(true);
    expect(result.mode).toBe("remote");
  });
});
