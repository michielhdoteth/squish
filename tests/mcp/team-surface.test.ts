import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readText(pathParts: string[]) {
  return readFileSync(join(process.cwd(), ...pathParts), "utf8");
}

describe("MCP team surface", () => {
  it("does NOT register team management tools in OSS", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).not.toContain('"squish_team"');
    expect(source).not.toContain('createTeamMember({');
    expect(source).not.toContain('getTeamMembers(projectId)');
  });

  it("lets remember and recall carry visibility scope metadata", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).toContain('visibilityScope: z.enum(["private", "project", "team", "global"])');
    expect(source).toContain('visibilityScope: z.union([');
    expect(source).toContain('visibilityScope,');
  });

  it("does NOT register memory policy tools in OSS", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).not.toContain('"squish_memory_policy"');
    expect(source).not.toContain('recommendMemoryScope({');
    expect(source).not.toContain('promoteMemoryVisibility(memoryId, targetScope, updateReason)');
  });
});
