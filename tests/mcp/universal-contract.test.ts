import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(pathParts: string[]) {
  return JSON.parse(readFileSync(join(process.cwd(), ...pathParts), "utf8"));
}

describe("MCP universal contract", () => {
  it("defines a universal config shape fixture without profiles", () => {
    const universal = readJson(["tests", "fixtures", "mcp", "universal-config.json"]);

    expect(universal.version).toBe(1);
    expect(universal.defaults).toBeTypeOf("object");
    expect(universal.servers).toBeTypeOf("object");
    expect(universal.profiles).toBeUndefined();
  });

  it("defines a migration map from legacy profiles to universal", () => {
    const migration = readJson(["config", "mcp-migration-map.json"]);

    expect(migration.from).toBe("profile-based");
    expect(migration.to).toBe("universal");
    expect(migration.legacyProfiles).toEqual([
      "default",
      "openclaw",
      "nanoclaw",
      "picoclaw",
      "claude-code",
      "opencode",
      "codex"
    ]);
    expect(migration.outputChange.from).toBe("generated/mcp/{profile}/");
    expect(migration.outputChange.to).toBe("generated/mcp/");
  });

  it("ships a universal schema contract file", () => {
    const schema = readJson(["config", "mcp-universal.schema.json"]);

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("Squish MCP Universal Config");
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["version", "defaults", "servers"]);
    expect(schema.properties.profiles).toBeUndefined();
  });
});
