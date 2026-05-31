import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(pathParts: string[]) {
  return JSON.parse(readFileSync(join(process.cwd(), ...pathParts), "utf8"));
}

describe("MCP mode semantics", () => {
  it("defines canonical local, team, and remote modes", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.canonicalModes).toEqual(["local", "team", "remote"]);
    expect(modes.defaultMode).toBe("local");
  });

  it("maps legacy team mode alias to team", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.legacyAliases.team).toBe("team");
  });

  it("defines team backends", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.teamBackends.supported).toContain("postgres");
    expect(modes.teamBackends.supported).toContain("supabase");
    expect(modes.teamBackends.supported).toContain("neon");
    expect(modes.teamBackends.default).toBe("postgres");
  });

  it("defines remote backends", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.remoteBackends.supported).toContain("supabase");
    expect(modes.remoteBackends.supported).toContain("neon");
    expect(modes.remoteBackends.default).toBe("supabase");
  });

  it("supports remote auth methods", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.remoteAuth.supported).toContain("oauth");
    expect(modes.remoteAuth.supported).toContain("token");
    expect(modes.remoteAuth.defaultForCli).toBe("token");
  });
});
