import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readText(pathParts: string[]) {
  return readFileSync(join(process.cwd(), ...pathParts), "utf8");
}

describe("MCP recall surface", () => {
  it("does not register the legacy dedicated search tool", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);
    const legacyToolName = `"squish_${"search"}"`;

    expect(source).not.toContain(legacyToolName);
    expect(source).toContain('"squish_recall"');
  });

  it("exposes squish_recall as query-or-id recall", () => {
    const source = readText(["packages", "mcp", "src", "index.ts"]);

    expect(source).toContain('query: z.string().describe("Query text or memory ID to recall")');
    expect(source).toContain("const isUuid =");
    expect(source).toContain("await searchMemories({");
  });

  it("delegates mcp health to the real server instead of hardcoded success", () => {
    const wrapper = readText(["bin", "squish-mcp.mjs"]);
    const hardcodedSuccess = `Health check: ${"OK"}`;

    expect(wrapper).not.toContain(hardcodedSuccess);
    expect(wrapper).toContain("mcpArgs.push('--health')");
    expect(wrapper).toContain("spawn(bunPath, [mcpPath, ...mcpArgs]");
  });
});
