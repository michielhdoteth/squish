import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readText(pathParts: string[]) {
  return readFileSync(join(process.cwd(), ...pathParts), "utf8");
}

describe("MCP team surface", () => {
  it("registers a dedicated team management tool", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).toContain('"squish_team"');
    expect(source).toContain('Actions: add, list, member, role, touch, remove.');
    expect(source).toContain('createTeamMember({');
    expect(source).toContain('getTeamMembers(projectId)');
  });

  it("lets remember and recall carry visibility scope metadata", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).toContain('visibilityScope: z.enum(["private", "project", "team", "global"])');
    expect(source).toContain('visibilityScope: z.union([');
    expect(source).toContain('visibilityScope,');
  });
});
