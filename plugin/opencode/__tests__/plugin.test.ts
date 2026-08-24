/**
 * Tests for the Squish OpenCode plugin (v1.5.5).
 *
 * The plugin folder is copied verbatim to ~/.config/opencode/plugins/ at
 * install time, so it has no test-time deps beyond zod. We do NOT import
 * the plugin file directly (it has top-level module state — `currentSessionID`).
 * Instead we:
 *
 *   1. Read the plugin file as text and assert structural invariants
 *      (no `squish sessions ...` shell-outs, presence of SDK calls, etc).
 *   2. Use the Bun bundler to typecheck the file end-to-end.
 *   3. Verify the default export shape and the 9 tool descriptions by
 *      dynamically importing the bundled output.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";

const PLUGIN_DIR = resolve(import.meta.dir, "..");
const PLUGIN_INDEX = resolve(PLUGIN_DIR, "index.ts");
const BUILD_DIR = "C:\\Users\\michi\\AppData\\Local\\Temp\\squish-plugin-build2";

let source = "";
let builtPath = "";

beforeAll(async () => {
  source = await readFile(PLUGIN_INDEX, "utf8");

  const result = await build({
    entrypoints: [PLUGIN_INDEX],
    outdir: BUILD_DIR,
    target: "bun",
    format: "esm",
  });
  if (!result.success) {
    throw new Error("bun build failed: " + result.logs.join("\n"));
  }
  builtPath = resolve(BUILD_DIR, "index.js");
});

describe("plugin module shape", () => {
  it("has a default export { id: 'squish-memory', server: <plugin fn> }", async () => {
    const mod = (await import(builtPath)) as { default: { id: string; server: unknown } };
    expect(mod.default).toBeDefined();
    expect(mod.default.id).toBe("squish-memory");
    expect(typeof mod.default.server).toBe("function");
  });

  it("exposes all 9 LLM-invokable tools", async () => {
    const mod = (await import(builtPath)) as {
      default: {
        id: string;
        server: (input: unknown, opts?: unknown) => Promise<{
          tool: Record<string, { description: string }>;
          event: (input: { event: { type: string } }) => Promise<void>;
        }>;
      };
    };

    // Build a minimal fake OpenCode SDK client for the plugin factory.
    const fakeClient = makeFakeClient();
    const hooks = await mod.default.server(
      { client: fakeClient, directory: "C:/repo", worktree: "C:/repo" },
      { autoCapture: true },
    );

    expect(hooks.tool).toBeDefined();
    const toolNames = Object.keys(hooks.tool).sort();
    // 9 tools: 4 legacy memory primitives + 5 session tools.
    // (squish_session_inject was removed in v1.5.5 - the agent has
    //  bash + code-exec and can call `squish sessions search` directly.)
    expect(toolNames).toEqual([
      "squish_context",
      "squish_recall",
      "squish_remember",
      "squish_session_capture",
      "squish_session_list",
      "squish_session_related",
      "squish_session_search",
      "squish_session_show",
      "squish_stats",
    ]);

    for (const name of toolNames) {
      expect(hooks.tool[name].description).toBeTruthy();
      expect(hooks.tool[name].description.length).toBeGreaterThan(20);
    }
  });

  it("the 4 legacy squish_* tools each have a description", async () => {
    const mod = (await import(builtPath)) as {
      default: {
        id: string;
        server: (input: unknown, opts?: unknown) => Promise<{
          tool: Record<string, { description: string }>;
          event: (input: { event: { type: string } }) => Promise<void>;
        }>;
      };
    };

    const fakeClient = makeFakeClient();
    const hooks = await mod.default.server(
      { client: fakeClient, directory: "C:/repo", worktree: "C:/repo" },
      { autoCapture: true },
    );

    const legacyNames = ["squish_remember", "squish_recall", "squish_context", "squish_stats"];
    for (const name of legacyNames) {
      expect(hooks.tool[name]).toBeDefined();
      expect(hooks.tool[name].description).toBeTruthy();
      expect(hooks.tool[name].description.length).toBeGreaterThan(20);
    }
  });

  it("returns an event hook that handles the required event types", async () => {
    const mod = (await import(builtPath)) as {
      default: {
        id: string;
        server: (input: unknown, opts?: unknown) => Promise<{
          event: (input: { event: { type: string } }) => Promise<void>;
        }>;
      };
    };

    const fakeClient = makeFakeClient();
    const hooks = await mod.default.server(
      { client: fakeClient, directory: "C:/repo", worktree: "C:/repo" },
      { autoCapture: true },
    );
    expect(typeof hooks.event).toBe("function");

    // Fire each required event type. The hook must not throw.
    const eventTypes = [
      "session.created",
      "session.diff",
      "file.edited",
      "session.idle",
      "session.error",
      "command.executed",
    ];
    for (const type of eventTypes) {
      const event = makeFakeEvent(type);
      await expect(hooks.event({ event })).resolves.toBeUndefined();
    }
  });
});

describe("plugin file structural invariants", () => {
  it("does NOT shell out to `squish sessions list|show|search|related|inject`", () => {
    // The plugin must not invoke the human-facing `squish sessions ...` CLI.
    // It SHOULD call `squish remember` and `squish recall` for chunk persistence.
    const banned = [
      '"sessions", "list"',
      '"sessions", "show"',
      '"sessions", "search"',
      '"sessions", "related"',
      '"sessions", "inject"',
    ];
    for (const needle of banned) {
      expect(source).not.toContain(needle);
    }
  });

  it("uses OpenCode SDK for session discovery", () => {
    expect(source).toContain("input.client.session.list");
    expect(source).toContain("input.client.session.get");
    expect(source).toContain("input.client.session.messages");
  });

  it("uses OpenCode SDK for prompt injection", () => {
    expect(source).toContain("input.client.session.prompt");
  });

  it("calls `squish remember` for chunk persistence", () => {
    expect(source).toMatch(/remember/);
  });

  it("calls `squish recall` for chunk search", () => {
    expect(source).toMatch(/recall/);
  });

  it("vendors the `tool()` helper and does not import @opencode-ai/plugin", () => {
    expect(source).not.toMatch(/from\s+["']@opencode-ai\/plugin["']/);
    expect(source).toMatch(/function\s+tool\b/);
  });

  it("vendors the `tool.schema` alias (same as @opencode-ai/plugin)", () => {
    expect(source).toContain("tool.schema");
  });
});

// ---------------------------------------------------------------------------
// Test fakes
// ---------------------------------------------------------------------------

type FakeSdk = {
  list: () => Promise<unknown[]>;
  get: (input: { path: { id: string } }) => Promise<unknown>;
  messages: (input: { path: { id: string } }) => Promise<unknown>;
  diff: (input: { path: { id: string } }) => Promise<unknown>;
  prompt: (input: unknown) => Promise<unknown>;
};

function makeFakeClient(): {
  app: { log: (i: unknown) => Promise<unknown> };
  session: FakeSdk;
  vcs: { get: (i: { directory: string }) => Promise<{ branch?: string } | undefined> };
} {
  return {
    app: { log: async () => null },
    session: {
      list: async () => [],
      get: async () => ({ id: "fake", title: "fake" }),
      messages: async () => [],
      diff: async () => ({ files: [] }),
      prompt: async () => ({ ok: true }),
    },
    vcs: { get: async () => ({ branch: "main" }) },
  };
}

function makeFakeEvent(type: string): Record<string, unknown> {
  switch (type) {
    case "session.created":
      return { type, sessionID: "sess-1" };
    case "session.diff":
      return { type, sessionID: "sess-1", diff: { files: ["src/foo.ts"] } };
    case "file.edited":
      return { type, file: "src/bar.ts" };
    case "session.idle":
      return { type, sessionID: "sess-1" };
    case "session.error":
      return { type, sessionID: "sess-1", error: { message: "boom" } };
    case "command.executed":
      return { type, arguments: "npm test" };
    default:
      return { type };
  }
}
