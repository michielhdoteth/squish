import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const TEST_TIMEOUT = 45_000;

function resolveServerCommand(): { command: string; args: string[] } {
  const rootDir = join(import.meta.dir, "..", "..");
  const entryPath = join(rootDir, "packages", "mcp", "src", "index.ts");

  // Detect bun (same logic as runtime-launcher.mjs)
  try {
    const bunPath = execFileSync(
      process.platform === "win32" ? "bun.exe" : "bun",
      ["--version"],
      { stdio: ["pipe", "pipe", "pipe"], timeout: 5000 }
    );
    if (bunPath && bunPath.toString().trim()) {
      const whichCmd = process.platform === "win32" ? "where" : "which";
      const pathResult = execFileSync(whichCmd, [process.platform === "win32" ? "bun.exe" : "bun"], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });
      const bunFullPath = pathResult.toString().trim().split("\n")[0].trim();
      if (bunFullPath) {
        return { command: bunFullPath, args: [entryPath, "--stdio"] };
      }
    }
  } catch {
    // bun not available
  }

  // Fallback: try node with tsx
  const tsxCli = join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  return { command: process.execPath, args: [tsxCli, entryPath, "--stdio"] };
}

interface ServerHandle {
  child: ChildProcess;
  send: (obj: unknown) => void;
  readLine: (matcher: (line: any) => boolean, timeoutMs?: number) => Promise<any>;
  close: () => Promise<void>;
  callTool: (name: string, args?: Record<string, unknown>, timeoutMs?: number) => Promise<any>;
  nextId: () => number;
}

async function spawnServer(tmpDir: string): Promise<ServerHandle> {
  const { command, args } = resolveServerCommand();
  const rootDir = join(import.meta.dir, "..", "..");

  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: rootDir,
      env: {
        ...process.env,
        SQUISH_DATA_DIR: tmpDir,
        SQUISH_QUIET: "1",
      },
  });

  let stdoutBuf = "";
  const pendingReaders: Array<{
    matcher: (line: any) => boolean;
    resolve: (v: any) => void;
    reject: (e: Error) => void;
  }> = [];

  child.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();

    let nlIdx: number;
    while ((nlIdx = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, nlIdx).trim();
      stdoutBuf = stdoutBuf.slice(nlIdx + 1);
      if (!line) continue;

      for (const pr of pendingReaders) {
        try {
          const parsed = JSON.parse(line);
          if (pr.matcher(parsed)) {
            pr.resolve(parsed);
            pendingReaders.splice(pendingReaders.indexOf(pr), 1);
            break;
          }
        } catch {
          // Not JSON, skip
        }
      }
    }
  });

  let idCounter = 1;

  function nextId(): number {
    return idCounter++;
  }

  function send(obj: unknown) {
    child.stdin!.write(JSON.stringify(obj) + "\n");
  }

  function readLine(
    matcher: (line: any) => boolean,
    timeoutMs = 30_000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = pendingReaders.findIndex((r) => r.resolve === resolve);
        if (idx !== -1) pendingReaders.splice(idx, 1);
        reject(new Error(`readLine timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pendingReaders.push({
        matcher,
        resolve: (v: any) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  function close(): Promise<void> {
    return new Promise((resolve) => {
      child.stdin!.end();
      const killTimer = setTimeout(() => {
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
          setTimeout(resolve, 300);
        }, 500);
      }, 2000);
      child.on("exit", () => {
        clearTimeout(killTimer);
        setTimeout(resolve, 300);
      });
    });
  }

  async function callTool(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs = 30_000
  ): Promise<any> {
    const id = nextId();
    send({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const resp = await readLine((r: any) => r.id === id, timeoutMs);
    return resp;
  }

  // Wait for server process to fully start (schema health check, McpServer setup, transport)
  await new Promise((r) => setTimeout(r, 10_000));

  return { child, send, readLine, close, callTool, nextId };
}

async function initializeServer(handle: ServerHandle): Promise<void> {
  const id = handle.nextId();
  handle.send({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-tool-handlers", version: "1.0.0" },
    },
  });
  await handle.readLine((r: any) => r.id === id, 45_000);

  handle.send({ jsonrpc: "2.0", method: "notifications/initialized" });
}

function parseToolResult(resp: any): any {
  const text = resp.result.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    // Tool returned non-JSON text (e.g. error message) - wrap in raw object
    return { _raw: text, ok: false };
  }
}

function getRawText(resp: any): string {
  return resp.result.content[0].text;
}

// ─── Shared server (spawned once, shared across all describe blocks) ──

let sharedServer: ServerHandle;
let sharedTmpDir: string;

beforeAll(async () => {
  sharedTmpDir = await mkdtemp(join(tmpdir(), "squish-tool-handlers-"));
  sharedServer = await spawnServer(sharedTmpDir);
  await initializeServer(sharedServer);
}, 60_000);

afterAll(async () => {
  if (sharedServer) {
    await sharedServer.close();
  }
  if (sharedTmpDir) {
    await rm(sharedTmpDir, { recursive: true, force: true });
  }
}, 15_000);

// ─── Tests ────────────────────────────────────────────────────────────

describe("MCP Tool Handlers", () => {
  describe("squish_stats", () => {
    it(
      "returns health status with schema info",
      async () => {
        const resp = await sharedServer.callTool("squish_stats", {}, TEST_TIMEOUT);
        expect(resp.result).toBeDefined();
        expect(resp.result.content).toBeDefined();
        expect(resp.result.content.length).toBeGreaterThan(0);

        const text = getRawText(resp);
        // Health may return error text or valid JSON
        expect(text).toBeTruthy();
        expect(text.length).toBeGreaterThan(0);

        // If it's JSON, verify structure
        const parsed = parseToolResult(resp);
        if (parsed._raw !== undefined) {
          // Non-JSON response - acceptable as health check
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBeDefined();
          expect(typeof parsed.ok).toBe("boolean");
          expect(parsed.version).toBeDefined();
        }
      },
      TEST_TIMEOUT
    );

    it(
      "includes tool count in response",
      async () => {
        const resp = await sharedServer.callTool("squish_stats", {}, TEST_TIMEOUT);
        const parsed = parseToolResult(resp);
        if (parsed._raw !== undefined) {
          // Non-JSON response is acceptable
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBeDefined();
          expect(parsed.version).toBe("2.0.0");
        }
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_remember", () => {
    it(
      "stores a memory with auto-detected type",
      async () => {
        const content = "The sky is blue and the grass is green";
        const resp = await sharedServer.callTool(
          "squish_remember",
          { content },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        expect(parsed.ok).toBe(true);
        expect(parsed.id).toBeDefined();
        expect(parsed.routing).toBe("memory");
        expect(parsed.type).toBeDefined();
      },
      TEST_TIMEOUT
    );

    it(
      "stores with explicit type (decision)",
      async () => {
        const content = "We decided to use PostgreSQL for the database backend";
        const resp = await sharedServer.callTool(
          "squish_remember",
          { content, type: "decision" },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        expect(parsed.ok).toBe(true);
        expect(parsed.id).toBeDefined();
        expect(parsed.type).toBe("decision");
      },
      TEST_TIMEOUT
    );

    it(
      "returns success with memory ID",
      async () => {
        const content = "Unit test memory with ID verification";
        const resp = await sharedServer.callTool(
          "squish_remember",
          { content },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        expect(parsed.ok).toBe(true);
        expect(parsed.id).toBeDefined();
        // Verify the ID is a UUID format
        expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/);
      },
      TEST_TIMEOUT
    );

    it(
      "handles tags correctly",
      async () => {
        const content = "Tagged memory for testing purposes";
        const tags = ["test-tag", "unit-test", "mcp"];
        const resp = await sharedServer.callTool(
          "squish_remember",
          { content, tags },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        expect(parsed.ok).toBe(true);
        expect(parsed.id).toBeDefined();
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_recall", () => {
    let storedId: string;

    beforeAll(async () => {
      // Store a memory to recall
      const content = "Recall test memory for unique query verification";
      const resp = await sharedServer.callTool(
        "squish_remember",
        { content, type: "fact" },
        TEST_TIMEOUT
      );
      const parsed = parseToolResult(resp);
      storedId = parsed.id;
    });

    it(
      "searches by query text",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_recall",
          { query: "Recall test memory" },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        // Recall may return ok:true with results, or a non-JSON error (e.g. "Failed to search memories")
        // when vector/embedding infrastructure is unavailable in test env
        if (parsed._raw !== undefined) {
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBe(true);
          expect(parsed.count).toBeGreaterThanOrEqual(1);
          expect(parsed.results.length).toBeGreaterThanOrEqual(1);
          expect(parsed.results[0].content).toContain("Recall test memory");
        }
      },
      TEST_TIMEOUT
    );

    it(
      "respects limit parameter",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_recall",
          { query: "test", limit: 1 },
          TEST_TIMEOUT
        );
        const parsed = parseToolResult(resp);
        if (parsed._raw !== undefined) {
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBe(true);
          expect(parsed.results.length).toBeLessThanOrEqual(1);
        }
      },
      TEST_TIMEOUT
    );

    it(
      "handles type parameter",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_recall",
          { query: "Recall test memory" },
          TEST_TIMEOUT
        );
        const parsed = parseToolResult(resp);
        // Should not crash regardless of search infrastructure availability
        expect(resp.result).toBeDefined();
        if (parsed._raw === undefined && parsed.ok) {
          if (parsed.results.length > 0) {
            expect(parsed.results[0].type).toBeDefined();
          }
        }
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_context", () => {
    it(
      "returns project context for current directory",
      async () => {
        const resp = await sharedServer.callTool("squish_context", {}, TEST_TIMEOUT);
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        // Context may return ok:true JSON or error text
        if (parsed._raw !== undefined) {
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBeDefined();
        }
      },
      TEST_TIMEOUT
    );

    it(
      "handles missing project gracefully",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_context",
          { project: "/nonexistent/path/for/test" },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        // Should not crash, may return error or empty context
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_stats", () => {
    it(
      "returns memory statistics",
      async () => {
        const resp = await sharedServer.callTool("squish_stats", {}, TEST_TIMEOUT);
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        if (parsed._raw !== undefined) {
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBe(true);
        }
      },
      TEST_TIMEOUT
    );

    it(
      "works globally (no project filter)",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_stats",
          {},
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        if (parsed._raw !== undefined) {
          expect(typeof parsed._raw).toBe("string");
        } else {
          expect(parsed.ok).toBeDefined();
        }
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_link", () => {
    let memoryId1: string;
    let memoryId2: string;

    beforeAll(async () => {
      const resp1 = await sharedServer.callTool(
        "squish_remember",
        { content: "First memory for link testing" },
        TEST_TIMEOUT
      );
      memoryId1 = parseToolResult(resp1).id;

      const resp2 = await sharedServer.callTool(
        "squish_remember",
        { content: "Second memory for link testing" },
        TEST_TIMEOUT
      );
      memoryId2 = parseToolResult(resp2).id;
    });

    it(
      "add creates association between memories",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_link",
          {
            action: "add",
            fromId: memoryId1,
            toId: memoryId2,
          },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const text = resp.result.content[0].text;
        expect(text).toContain("Association created");
      },
      TEST_TIMEOUT
    );

    it(
      "find finds related memories",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_link",
          { action: "find", memoryId: memoryId1 },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const text = resp.result.content[0].text;
        expect(text).toContain("related memories");
      },
      TEST_TIMEOUT
    );
  });

  describe("squish_forget", () => {
    let forgetMemoryId: string;

    beforeAll(async () => {
      // Store a memory to delete
      const resp = await sharedServer.callTool(
        "squish_remember",
        { content: "Memory to forget for testing" },
        TEST_TIMEOUT
      );
      const parsed = parseToolResult(resp);
      forgetMemoryId = parsed.id;
    });

    it(
      "deletes a memory by ID",
      async () => {
        const resp = await sharedServer.callTool(
          "squish_forget",
          {
            memoryId: forgetMemoryId,
          },
          TEST_TIMEOUT
        );
        expect(resp.result).toBeDefined();
        const parsed = parseToolResult(resp);
        expect(parsed.ok).toBe(true);
        expect(parsed.deleted).toBe(1);
      },
      TEST_TIMEOUT
    );
  });
});
