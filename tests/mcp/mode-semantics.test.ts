import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(pathParts: string[]) {
  return JSON.parse(readFileSync(join(process.cwd(), ...pathParts), "utf8"));
}

describe("MCP mode semantics", () => {
  it("defines canonical local and remote modes", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.canonicalModes).toEqual(["local", "remote"]);
    expect(modes.defaultMode).toBe("local");
  });

  it("maps legacy team mode alias to remote with warning policy", () => {
    const modes = readJson(["config", "mcp-mode-semantics.json"]);

    expect(modes.legacyAliases.team).toBe("remote");
    expect(modes.legacyPolicy.action).toBe("warn-and-map");
    expect(modes.legacyPolicy.untilVersion).toBeTypeOf("string");
  });
});
