import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(pathParts: string[]) {
  return JSON.parse(readFileSync(join(process.cwd(), ...pathParts), "utf8"));
}

describe("MCP remote auth contract", () => {
  it("supports oauth and token methods", () => {
    const auth = readJson(["config", "mcp-remote-auth.json"]);

    expect(auth.methods).toEqual(["oauth", "token"]);
    expect(auth.defaultMethod).toBe("token");
  });

  it("defines precedence and required token env var for cli flows", () => {
    const auth = readJson(["config", "mcp-remote-auth.json"]);

    expect(auth.precedence).toEqual(["token", "oauth"]);
    expect(auth.token.requiredEnv).toContain("SQUISH_REMOTE_TOKEN");
    expect(auth.cli.openclaw.default).toBe("token");
  });
});
