#!/usr/bin/env node

// CRITICAL: Redirect console.log to stderr to prevent JSON-RPC stream corruption
// MCP stdio requires stdout to contain ONLY valid JSON-RPC messages
console.log = console.error;
console.info = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { config } from "../config.js";
import { hybridSearch } from "../core/memory/hybrid-retrieval.js";
import { rememberMemory, searchMemories, getMemoryById, type MemoryType } from "../core/memory/memories.js";
import { getEmbedding, getBatchEmbeddings } from "../core/embeddings.js";
import { getQMDClient } from "../core/embeddings/qmd-client.js";
import { createAssociation, getRelatedMemories, trackCoactivation, type AssociationType } from "../core/associations.js";
import { createObservation, getObservationsForProject, type ObservationType } from "../core/observations.js";
import { ensureProject, getProjectByPath, getAllProjects } from "../core/projects.js";
import { getMemoryStats } from "../core/memory/stats.js";
import { logger } from "../core/logger.js";
import { getDb } from "../db/index.js";
import { getSchema } from "../db/schema.js";
import { eq } from "drizzle-orm";

const SERVER_NAME = "squish-memory";
const SERVER_VERSION = "1.0.2";

function parseArgs(): { mode: "stdio" | "http"; port: number; health: boolean } {
  const args = process.argv.slice(2);
  let mode: "stdio" | "http" = "stdio";
  let port = config.mcpServerPort || 8767;
  let health = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--http" || args[i] === "-h") {
      mode = "http";
    } else if (args[i] === "--stdio" || args[i] === "-s") {
      mode = "stdio";
    } else if (args[i] === "--port" || args[i] === "-p") {
      port = parseInt(args[i + 1], 10) || 8767;
      i++;
    } else if (args[i] === "--health" || args[i] === "--check") {
      health = true;
    }
  }

  if (process.env.SQUISH_MCP_MODE === "http") {
    mode = "http";
  }

  return { mode, port, health };
}

function safeRegisterTool(
  server: McpServer,
  name: string,
  definition: any,
  handler: any
): boolean {
  try {
    server.registerTool(name, definition, handler);
    console.error(`[MCP] Registered tool: ${name}`);
    return true;
  } catch (error) {
    console.error(`[MCP] Failed to register tool ${name}:`, error);
    return false;
  }
}

function createSquishServer(): { server: McpServer; toolCount: number } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  let toolCount = 0;

  console.error(`[MCP] Starting tool registration...`);

  if (safeRegisterTool(
    server,
    "squish_search",
    {
      description: "Hybrid search across QMD, SQLite DB, and embeddings with graph expansion",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().min(1).max(100).default(5).describe("Maximum results"),
        project: z.string().optional().describe("Project path filter"),
        mode: z.enum(["hybrid", "qmd", "db", "semantic"]).default("hybrid").describe("Search mode")
      }
    },
    async ({ query, limit = 5, project, mode = "hybrid" }: { query: string; limit?: number; project?: string; mode?: "hybrid" | "qmd" | "db" | "semantic" }) => {
      const results = await hybridSearch({
        query,
        limit,
        project,
        candidateLimit: 50,
        resultLimit: limit
      });

      const formatted = results.map((r, i) =>
        `${i + 1}. [${r.type || "memory"}] ${r.content?.substring(0, 200)}... (score: ${r.hybridScore?.toFixed(2)})`
      ).join("\n");

      return { content: [{ type: "text", text: `Found ${results.length} memories:\n\n${formatted}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_remember",
    {
      description: "Store a new memory in Squish with automatic embedding",
      inputSchema: {
        content: z.string().describe("Memory content to store"),
        type: z.enum(["observation", "fact", "decision", "context", "preference"]).default("observation").describe("Memory type"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
        project: z.string().optional().describe("Project path")
      }
    },
    async ({ content, type = "observation", tags = [], project }: { content: string; type?: MemoryType; tags?: string[]; project?: string }) => {
      const memory = await rememberMemory({ content, type: type as MemoryType, tags, project });
      return { content: [{ type: "text", text: `Memory stored: ${memory.id}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_recall",
    {
      description: "Retrieve a specific memory by ID",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to retrieve")
      }
    },
    async ({ memoryId }: { memoryId: string }) => {
      const memory = await getMemoryById(memoryId);
      if (!memory) {
        return { content: [{ type: "text", text: `Memory not found: ${memoryId}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(memory, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_forget",
    {
      description: "Delete a memory by ID",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to delete")
      }
    },
    async ({ memoryId }: { memoryId: string }) => {
      const db = await getDb();
      const schema = await getSchema();
      // Cast to any to handle Drizzle ORM union type issue
      const sqliteDb = db as any;
      const result = await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
      return { content: [{ type: "text", text: `Memory deleted: ${memoryId}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_update",
    {
      description: "Update an existing memory",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to update"),
        content: z.string().optional().describe("New content"),
        tags: z.array(z.string()).optional().describe("New tags"),
        type: z.enum(["observation", "fact", "decision", "context", "preference"]).optional().describe("New type")
      }
    },
    async ({ memoryId, content, tags, type }: { memoryId: string; content?: string; tags?: string[]; type?: MemoryType }) => {
      const db = await getDb();
      const schema = await getSchema();
      
      const updates: Record<string, any> = {};
      if (content) updates.content = content;
      if (tags) updates.tags = config.isTeamMode ? tags : JSON.stringify(tags);
      if (type) updates.type = type;

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: "text", text: "No updates provided" }], isError: true };
      }

      // Cast to any to handle Drizzle ORM union type issue
      const sqliteDb2 = db as any;
      await sqliteDb2.update(schema.memories).set(updates).where(eq(schema.memories.id, memoryId));
      return { content: [{ type: "text", text: `Memory updated: ${memoryId}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_qmd_search",
    {
      description: "Search markdown files using QMD (BM25 + vector)",
      inputSchema: {
        query: z.string().describe("Search query"),
        collection: z.string().optional().describe("QMD collection name"),
        limit: z.number().min(1).max(100).default(10).describe("Maximum results")
      }
    },
    async ({ query, collection, limit = 10 }: { query: string; collection?: string; limit?: number }) => {
      const client = await getQMDClient();
      const available = await client.isAvailable();
      
      if (!available) {
        return { content: [{ type: "text", text: "QMD not available. Install with: bun install -g qmd" }], isError: true };
      }

      const results = await client.search({ query, collection, limit });
      const formatted = results.map((r: any, i: number) =>
        `${i + 1}. ${r.path || r.file} (score: ${r.score?.toFixed(2)})\n   ${r.content?.substring(0, 150)}...`
      ).join("\n\n");

      return { content: [{ type: "text", text: `QMD found ${results.length} results:\n\n${formatted}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_associate",
    {
      description: "Create an association between two memories in the graph",
      inputSchema: {
        fromMemoryId: z.string().uuid().describe("Source memory ID"),
        toMemoryId: z.string().uuid().describe("Target memory ID"),
        type: z.enum(["relates_to", "supersedes", "contradicts", "supports", "duplicate", "merged"]).describe("Association type"),
        weight: z.number().min(0).max(1).default(0.5).describe("Association strength (0-1)")
      }
    },
    async ({ fromMemoryId, toMemoryId, type, weight = 0.5 }: { fromMemoryId: string; toMemoryId: string; type: AssociationType; weight?: number }) => {
      await createAssociation(fromMemoryId, toMemoryId, type, weight);
      return { content: [{ type: "text", text: `Association created: ${fromMemoryId} -> ${toMemoryId} (${type})` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_related",
    {
      description: "Get related memories via graph traversal",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to find relations for"),
        depth: z.number().min(1).max(5).default(2).describe("Graph traversal depth"),
        minWeight: z.number().min(0).max(1).default(0.3).describe("Minimum association weight")
      }
    },
    async ({ memoryId, depth = 2, minWeight = 0.3 }: { memoryId: string; depth?: number; minWeight?: number }) => {
      const related = await getRelatedMemories(memoryId, depth * 5);
      const filtered = related.filter((r: any) => r.weight >= minWeight);
      const formatted = filtered.map((r: any, i: number) =>
        `${i + 1}. [${r.type || "memory"}] ${r.content?.substring(0, 100)}... (weight: ${r.weight?.toFixed(2)})`
      ).join("\n");

      return { content: [{ type: "text", text: `Found ${related.length} related memories:\n\n${formatted}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_context",
    {
      description: "Get project context with relevant memories",
      inputSchema: {
        project: z.string().describe("Project path"),
        limit: z.number().min(1).max(50).default(10).describe("Maximum memories to return")
      }
    },
    async ({ project, limit = 10 }: { project: string; limit?: number }) => {
      const projectRecord = await getProjectByPath(project);
      if (!projectRecord) {
        return { content: [{ type: "text", text: `Project not found: ${project}` }], isError: true };
      }

      const recentMemories = await searchMemories({ query: "", project, limit });
      const observations = await getObservationsForProject(project, 5);

      const context = {
        project: projectRecord,
        recentMemories: recentMemories.slice(0, limit),
        recentObservations: observations
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_observe",
    {
      description: "Store an observation about tool usage, patterns, or insights",
      inputSchema: {
        type: z.enum(["tool_use", "file_change", "error", "pattern", "insight"]).describe("Observation type"),
        action: z.string().describe("Action performed"),
        summary: z.string().describe("Summary of observation"),
        target: z.string().optional().describe("Target file or resource"),
        project: z.string().optional().describe("Project path")
      }
    },
    async ({ type, action, summary, target, project }: { type: ObservationType; action: string; summary: string; target?: string; project?: string }) => {
      const observation = await createObservation({ type, action, summary, target, project });
      return { content: [{ type: "text", text: `Observation stored: ${observation.id}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_embed",
    {
      description: "Generate embeddings for text using configured provider",
      inputSchema: {
        text: z.string().describe("Text to embed")
      }
    },
    async ({ text }: { text: string }) => {
      const embedding = await getEmbedding(text);
      if (!embedding) {
        return { content: [{ type: "text", text: "Failed to generate embedding" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ dimensions: embedding.length, preview: embedding.slice(0, 5) }, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_health",
    {
      description: "Check Squish system health status",
      inputSchema: {}
    },
    async (): Promise<any> => {
      const qmdClient = await getQMDClient();
      const qmdAvailable = await qmdClient.isAvailable();

      return { content: [{ type: "text", text: JSON.stringify({
        status: "ok",
        version: SERVER_VERSION,
        mode: config.isManagedMode ? "managed" : "local",
        embeddings: config.embeddingsProvider,
        qmd: qmdAvailable ? "available" : "unavailable",
        timestamp: new Date().toISOString()
      }, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_stats",
    {
      description: "Get memory statistics for a project",
      inputSchema: {
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ project }: { project?: string }) => {
      const stats = await getMemoryStats(project || process.cwd());
      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_projects",
    {
      description: "List all registered projects",
      inputSchema: {}
    },
    async (): Promise<any> => {
      const projects = await getAllProjects();
      const formatted = projects.map((p, i) =>
        `${i + 1}. ${p.name}\n   Path: ${p.path}\n   ID: ${p.id}`
      ).join("\n\n");

      return { content: [{ type: "text", text: `Found ${projects.length} projects:\n\n${formatted}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_confidence",
    {
      description: "Get or set confidence level for a memory (0-100)",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID"),
        level: z.number().min(0).max(100).optional().describe("Confidence level to set (0-100)")
      }
    },
    async ({ memoryId, level }: { memoryId: string; level?: number }) => {
      const db = await getDb();
      const schema = await getSchema();
      
      if (level !== undefined) {
        const sqliteDb = db as any;
        await sqliteDb.update(schema.memories)
          .set({ confidence: level })
          .where(eq(schema.memories.id, memoryId));
        return { content: [{ type: "text", text: `Confidence set to ${level} for memory ${memoryId}` }] };
      }
      
      const sqliteDb2 = db as any;
      const result = await sqliteDb2.select().from(schema.memories).where(eq(schema.memories.id, memoryId));
      if (result.length === 0) {
        return { content: [{ type: "text", text: `Memory not found: ${memoryId}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Confidence for memory ${memoryId}: ${result[0].confidence}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_pin",
    {
      description: "Pin or unpin a memory to prevent consolidation",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID"),
        pinned: z.boolean().default(true).describe("Pin (true) or unpin (false)")
      }
    },
    async ({ memoryId, pinned }: { memoryId: string; pinned: boolean }) => {
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      
      await sqliteDb.update(schema.memories)
        .set({ isPinned: pinned })
        .where(eq(schema.memories.id, memoryId));
      
      return { content: [{ type: "text", text: `Memory ${memoryId} ${pinned ? 'pinned' : 'unpinned'}` }] };
    }
  )) toolCount++;

  console.error(`[MCP] Tool registration complete. Registered ${toolCount} tools.`);

  return { server, toolCount };
}

async function runStdio(server: McpServer, toolCount: number): Promise<void> {
  console.error(`[MCP] Starting in STDIO mode...`);
  const transport = new StdioServerTransport();
  
  transport.onclose = () => {
    console.error(`[MCP] STDIO transport closed`);
  };
  
  await server.connect(transport);
  console.error(`[MCP] Connected via stdio. ${toolCount} tools available.`);
  
  // Keep process alive - wait for stdin to close or process signals
  await new Promise<void>((resolve) => {
    process.stdin.on('close', () => {
      console.error(`[MCP] STDIO stdin closed, shutting down`);
      resolve();
    });
    
    process.on('SIGINT', () => {
      console.error(`[MCP] Received SIGINT, shutting down`);
      resolve();
    });
    
    process.on('SIGTERM', () => {
      console.error(`[MCP] Received SIGTERM, shutting down`);
      resolve();
    });
  });
}

async function runHttp(server: McpServer, port: number): Promise<void> {
  console.error(`[MCP] Starting in HTTP mode on port ${port}...`);

  const app = express();
  app.use(express.json());

  const transports = new Map<string, SSEServerTransport>();

  app.get("/health", (req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/message", res);
    const sessionId = Math.random().toString(36).substring(7);
    transports.set(sessionId, transport);
    
    console.error(`[MCP] SSE connection established: ${sessionId}`);
    
    await server.connect(transport);

    req.on("close", () => {
      console.error(`[MCP] SSE connection closed: ${sessionId}`);
      transports.delete(sessionId);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string || "default";
    const transport = transports.get(sessionId);
    
    if (!transport) {
      res.status(400).json({ error: "No active session" });
      return;
    }

    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error(`[MCP] Error handling message:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  await new Promise<void>((resolve) => app.listen(port, () => {
    console.error(`[MCP] HTTP server listening on port ${port}`);
    console.error(`[MCP] SSE endpoint: http://localhost:${port}/sse`);
    console.error(`[MCP] Health: http://localhost:${port}/health`);
    resolve();
  }));
}

async function runHealthCheck(): Promise<void> {
  console.error(`[MCP] Running health check...`);
  
  try {
    const { server, toolCount } = createSquishServer();
    console.error(`[MCP] Health check passed. Server initialized with ${toolCount} tools.`);
    process.exit(0);
  } catch (error) {
    console.error(`[MCP] Health check failed:`, error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    console.error(`[${SERVER_NAME}] v${SERVER_VERSION} initializing...`);
    console.error(`[${SERVER_NAME}] Mode: ${config.isManagedMode ? "managed" : "local"}`);
    console.error(`[${SERVER_NAME}] Embeddings: ${config.embeddingsProvider}`);

    const { mode, port, health } = parseArgs();

    if (health) {
      await runHealthCheck();
      return;
    }

    const { server, toolCount } = createSquishServer();

    const shutdown = async () => {
      console.error(`[${SERVER_NAME}] Shutting down...`);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (mode === "stdio") {
      await runStdio(server, toolCount);
    } else {
      await runHttp(server, port);
    }
  } catch (error) {
    console.error(`[${SERVER_NAME}] Fatal error:`, error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
