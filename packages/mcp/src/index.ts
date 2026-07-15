#!/usr/bin/env node

// Load .env file for config
import 'dotenv/config';

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
// Use zod/v3 for MCP SDK compatibility - the SDK's toJsonSchemaCompat uses
// z4mini.toJSONSchema which crashes with Zod v4 classic schemas (schema._zod.def mismatch)
import { z } from "zod/v3";
import { config, detectProjectScope } from "../../../config.js";
import { getDb } from "../../../db/index.js";
import { getSchema } from "../../../db/schema.js";
import { isSchemaDriftError, probeSchemaHealth, type SchemaProbeResult } from "../../../db/schema-health.js";
import { eq } from "drizzle-orm";
import { initializeScheduler } from "../../../core/scheduler/cron-scheduler.js";
// Internal utilities for multimodal ingestion and LLM consolidation
// (functionality wired into squish_remember and squish_stats, not exposed as separate tools)
import {
  getWatcherStatus,
  controlWatcher,
  getMultimodalConfig,
} from "./multimodal-utils.js";
import {
  runLlmConsolidation,
  getConsolidationStatus,
  getConsolidationConfig,
} from "./consolidation-utils.js";
import {
  buildContextState,
  buildHealthState,
  buildInspectState,
  buildStatsState,
  resolveProjectScope,
} from "../../../core/runtime/trust-state.js";
import { rememberMemory, search as searchMemories, getMemory } from "../../../core/memory/memories.js";
import { getQMDClient } from "../../../core/embeddings/qmd-client.js";
import { createAssociation, getRelatedMemories } from "../../../core/associations.js";
import { createLearning } from "../../../core/ingestion/learnings.js";
import { getAllProjects } from "../../../core/projects.js";
import { logger } from "../../../core/logger.js";

// CRITICAL: Redirect console.log to stderr AFTER all imports

// CRITICAL: Redirect console.log to stderr AFTER all imports
// MCP stdio requires stdout to contain ONLY valid JSON-RPC messages
// Must be after imports because ESM hoists imports above this assignment
console.log = console.error;
console.info = console.error;

const SERVER_NAME = "squish-memory";
const SERVER_VERSION = "2.0.0";

// Create server instance ONCE (not per-session)
const { server: SQUISH_SERVER, toolCount: SQUISH_TOOL_COUNT } = createSquishServer();
console.error(`[MCP] Server created with ${SQUISH_TOOL_COUNT} tools`);

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
    server.registerTool(name, definition, async (input: any) => {
      const probe = await probeSchemaHealth();
      if (probe.status !== "ok") {
        return schemaProbeErrorResult(probe);
      }

      try {
        return await handler(input);
      } catch (error) {
        if (isSchemaDriftError(error)) {
          return schemaProbeErrorResult(error.probe);
        }

        const probe = await probeSchemaHealth();
        if (probe.status !== "ok") {
          return schemaProbeErrorResult(probe);
        }

        throw error;
      }
    });
    console.error(`[MCP] Registered tool: ${name}`);
    return true;
  } catch (error) {
    console.error(`[MCP] Failed to register tool ${name}:`, error);
    return false;
  }
}

function schemaProbeErrorResult(probe: SchemaProbeResult) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: false,
        error: probe.status === "drifted" ? "schema_drift" : "database_unavailable",
        backend: probe.backend,
        detail: probe.detail,
        missingTables: probe.missingTables,
        remediation: probe.remediation,
      }, null, 2),
    }],
    isError: true,
  };
}

function errorResponse(code: string, message: string, detail?: string, remediation?: string) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: false,
        error: code,
        message,
        ...(detail && { detail }),
        ...(remediation && { remediation }),
        version: SERVER_VERSION,
      }, null, 2),
    }],
    isError: true,
  };
}

/**
 * Resolve the effective project path for an MCP tool.
 * Priority: explicit project argument > auto-detected from env/cwd > null (global)
 */
function resolveProjectPath(projectArg?: string): string | undefined {
  if (projectArg) return projectArg;
  return detectProjectScope() ?? undefined;
}

function createSquishServer(): { server: McpServer; toolCount: number } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  let toolCount = 0;

  console.error(`[MCP] Starting tool registration...`);

  // squish_remember - UNIFIED MEMORY WRITE
  // Single smart write path: auto-detects intent and routes to memory or learning
  // Also supports file ingestion via filePath parameter
  if (safeRegisterTool(
    server,
    "squish_remember",
    {
      description: "Store any memory, learning, or ingest media files. System auto-detects type and routes appropriately. For text: provide content. For files: provide filePath. Supports images, audio, video, and documents (27+ file types).",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: {
        content: z.string().optional().describe("What to remember - can be a fact, decision, lesson, observation, or note"),
        filePath: z.string().optional().describe("Path to media file to ingest (image/audio/video/document)"),
        description: z.string().optional().describe("Description or context for media files"),
        type: z.enum(["observation", "fact", "decision", "context", "preference", "note"]).optional().describe("Memory type - auto-detected if not provided"),
        tags: z.array(z.string()).optional().describe("Optional tags for organization"),
      }
    },
    async ({ content, filePath, description, tags = [], type }: {
      content?: string;
      filePath?: string;
      description?: string;
      tags?: string[];
      type?: "observation" | "fact" | "decision" | "context" | "preference" | "note";
    }) => {
      const resolvedProject = resolveProjectPath();

      // File ingestion mode: ingest media file into memory
      if (filePath) {
        const { ingestFile } = await import('./multimodal-utils.js');
        const result = await ingestFile(filePath, resolvedProject, description || content, tags);
        
        if (result.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                memoryId: result.memoryId,
                mediaType: result.mediaType,
                message: `Ingested ${result.mediaType} file into memory`
              }, null, 2)
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: result.error,
                message: `Failed to ingest file: ${result.error}`
              }, null, 2)
            }]
          };
        }
      }

      // Text memory mode: require content
      if (!content) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "Either content or filePath is required",
              message: "Provide content for text memory or filePath for media ingestion"
            }, null, 2)
          }]
        };
      }

      // Import detection function
      const { detectMemorySignals } = await import('../../../core/memory/trigger-detector.js');
      const signals = detectMemorySignals(content);
      const user = undefined;

      let routing: "memory" | "learning" | "note" = "memory";
      let inferredType = type || signals.suggestedType;
      let routingReason = "";

      // Auto-detect routing from content patterns
      const hasLessonPattern = /(\bfailed\s+because\b|\blesson\s+learned\b|\bnext\s+time\b|\broot\s+cause\b|\bsuccess\b.*\bbecause\b|\bi\s+learned\b|\binsight\b)/i.test(content);
      const hasLearningType = /(\bsuccess\b|\bfailure\b|\bfix\b|\binsight\b)/i.test(content);
      const hasHackPattern = /(\bHACK\b|\bworkaround\b|\btemporary\s+fix\b)/i.test(content);
      const hasFixmePattern = /(\bFIXME\b|\bXXX\b|\bbug\b.*\bfix\b)/i.test(content);

      if (hasLessonPattern || hasLearningType || hasHackPattern || hasFixmePattern) {
        routing = "learning";
        routingReason = hasHackPattern || hasFixmePattern ? "Detected code pattern (HACK/FIXME)" : "Detected learning pattern in content";
      } else if (signals.suggestedType === 'task') {
        routing = "memory";
        routingReason = "Detected TODO pattern";
      } else if (signals.suggestedType === 'observation' && /\b(note|note\s+that|log|remember)\b/i.test(content)) {
        routing = "note";
        routingReason = "Detected note pattern";
      } else {
        routing = "memory";
        routingReason = `Detected as ${inferredType}`;
      }

      let result: any;

      if (routing === "learning") {
        // Determine learning type from content
        let finalLearningType = "insight";
        if (/(\bsuccess\b|\bworked\b|\bfinished\b)/i.test(content)) finalLearningType = "success";
        else if (/(\bfailed\b|\berror\b|\bbroke\b)/i.test(content)) finalLearningType = "failure";
        else if (/(\bfix\b|\b workaround\b|\bsolved\b)/i.test(content)) finalLearningType = "fix";

        const learning = await createLearning({
          type: finalLearningType as "success" | "failure" | "fix" | "insight",
          content,
          project: resolvedProject,
          autoLink: true
        });
        result = { id: learning.id, type: "learning", learningType: finalLearningType, content };
      } else {
        const memory = await rememberMemory({
          content,
          type: inferredType as any,
          tags,
          project: resolvedProject,
          user,
          source: 'mcp',
        });

        result = { id: memory.id, type: "memory", memoryType: inferredType, content, pinned: false };

        // Auto-update knowledge graph (fire-and-forget)
        const { addMemoryToGraph } = await import('../../../core/graph/graph-builder.js');
        const graphResult = await addMemoryToGraph(memory.id).catch((e: Error) => {
          console.warn('[Graph] Auto-update failed:', e.message);
          return null;
        });
        if (graphResult) {
          (result as any).graph = { entities: graphResult.entitiesCreated, relations: graphResult.relationsCreated };
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            id: result.id,
            routing,
            type: routing === "learning" ? result.learningType : result.memoryType,
            priority: signals.priority,
            confidence: signals.confidence,
            reason: routingReason,
            preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
          }, null, 2)
        }]
      };
    }
  )) toolCount++;

  // squish_recall - Retrieve a memory by ID or query
  if (safeRegisterTool(
    server,
    "squish_recall",
    {
      description: "Recall memories by query, or retrieve a specific memory by ID",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        query: z.string().describe("Query text or memory ID to recall"),
        limit: z.number().min(1).max(100).default(5).describe("Maximum results for query recall"),
        project: z.string().optional().describe("Project path filter"),
      }
    },
    async ({ query, limit = 5, project }: { query: string; limit?: number; project?: string }) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      const resolvedProject = resolveProjectPath(project);

      if (isUuid) {
        const memory = await getMemory(query, true);
        if (!memory) {
          return errorResponse("not_found", "Memory not found", query, "Check the memory ID or try a different query");
        }
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: 1, results: [memory], version: SERVER_VERSION }, null, 2) }] };
      }

      const results = await searchMemories({
        query,
        limit,
        project: resolvedProject,
      });

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: results.length, results, version: SERVER_VERSION }, null, 2) }] };
    }
  )) toolCount++;

  // squish_forget - Delete a memory by ID, or bulk delete with filters
  if (safeRegisterTool(
    server,
    "squish_forget",
    {
      description: "Delete a memory by ID, or bulk delete with search query",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: {
        memoryId: z.string().optional().describe("Memory ID to delete (single)"),
        search: z.string().optional().describe("Search query to match specific memories for bulk delete"),
      }
    },
    async ({ memoryId, search }: { memoryId?: string; search?: string }) => {
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      const resolvedProject = resolveProjectPath();

      // Single memory deletion (auto-confirm)
      if (memoryId) {
        const memory = await getMemory(memoryId, false);
        if (!memory) {
          return errorResponse("not_found", "Memory not found or not accessible", memoryId);
        }
        await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, deleted: 1, memoryId, version: SERVER_VERSION }) }] };
      }

      // Bulk deletion
      if (!search) {
        return errorResponse("invalid_args", "Provide memoryId or search query for bulk delete");
      }

      const results = await searchMemories({
        query: search,
        limit: 10,
        project: resolvedProject,
      });

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, matched: results.length, deleted: 0, dryRun: true, message: "Dry run. Re-call with confirm=true to execute.", version: SERVER_VERSION }, null, 2) }] };
    }
  )) toolCount++;


  // squish_link - Unified graph operations (find related, add links)
  if (safeRegisterTool(
    server,
    "squish_link",
    {
      description: "Manage memory associations: find related memories or add a link between two memories",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: {
        action: z.enum(["find", "add"]).describe("Action: find related memories or add a link"),
        memoryId: z.string().optional().describe("Memory ID (required for find action)"),
        fromId: z.string().optional().describe("Source memory ID (required for add action)"),
        toId: z.string().optional().describe("Target memory ID (required for add action)"),
      }
    },
    async ({ action, memoryId, fromId, toId }: { action: "find" | "add"; memoryId?: string; fromId?: string; toId?: string }) => {
      if (action === "find") {
        if (!memoryId) {
          return errorResponse("invalid_args", "memoryId required for find action");
        }
        const related = await getRelatedMemories(memoryId, 10);
        const formatted = related.map((r: any, i: number) =>
          `${i + 1}. [${r.type || "memory"}] ${r.content?.substring(0, 100)}... (weight: ${r.weight?.toFixed(2)})`
        ).join("\n");
        return { content: [{ type: "text", text: `Found ${related.length} related memories:\n\n${formatted}` }] };
      }

      if (action === "add") {
        if (!fromId || !toId) {
          return errorResponse("invalid_args", "fromId and toId required for add action");
        }
        await createAssociation(fromId, toId, "relates_to", 0.5);

        // Auto-update knowledge graph
        try {
          const { addMemoryToGraph } = await import('../../../core/graph/graph-builder.js');
          await Promise.all([
            addMemoryToGraph(fromId).catch(() => null),
            addMemoryToGraph(toId).catch(() => null)
          ]);
        } catch (e) { /* Ignore graph errors */ }

        return { content: [{ type: "text", text: `Association created: ${fromId} -> ${toId} (relates_to)` }] };
      }

      return errorResponse("invalid_action", "Invalid action. Use find or add");
    }
  )) toolCount++;

  // squish_context - Get project context or list registered projects
  if (safeRegisterTool(
    server,
    "squish_context",
    {
      description: "Get project context or list registered projects",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        project: z.string().optional().describe("Project path"),
        limit: z.number().min(1).max(50).default(10).describe("Maximum memories to return"),
        listProjects: z.boolean().optional().describe("List registered projects instead of loading context")
      }
    },
    async ({ project, limit = 10, listProjects = false }: { project?: string; limit?: number; listProjects?: boolean }) => {
      const resolvedProject = resolveProjectPath(project);
      if (listProjects) {
        const projects = await getAllProjects();
        const scope = await resolveProjectScope(resolvedProject);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              count: projects.length,
              currentProject: scope.currentProject,
              otherProjects: scope.otherProjects,
              projects: projects.map((entry) => ({
                id: entry.id,
                name: entry.name,
                path: entry.path,
                resolution: entry.path === '.' ? 'legacy-placeholder' : (entry.metadata?.source === 'mcp' ? 'auto-created' : 'inferred'),
              })),
              nextStep: scope.nextStep,
              version: SERVER_VERSION,
            }, null, 2),
          }],
        };
      }

      const context = await buildContextState(resolvedProject, limit);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...context, version: SERVER_VERSION }, null, 2) }] };
    }
  )) toolCount++;

  // squish_stats - Get memory statistics, system health, watcher control, or consolidation
  if (safeRegisterTool(
    server,
    "squish_stats",
    {
      description: "Get memory statistics and system health. Use action to control watcher or run LLM consolidation.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        project: z.string().optional().describe("Project path filter (global if omitted)"),
        action: z.enum(["status", "start_watcher", "stop_watcher", "consolidate"]).optional().describe(
          "status (default): return stats + health + watcher status + consolidation config. " +
          "start_watcher: start file watcher for multimodal ingestion. " +
          "stop_watcher: stop file watcher. " +
          "consolidate: run LLM cross-connection finding between memories."
        ),
      }
    },
    async ({ project, action = "status" }: { project?: string; action?: string }) => {
      const resolvedProject = resolveProjectPath(project);

      // --- Watcher actions ---
      if (action === "start_watcher") {
        const result = await controlWatcher("start", resolvedProject);
        return { content: [{ type: "text", text: JSON.stringify({ ok: result.success, action: "start_watcher", error: result.error }, null, 2) }] };
      }
      if (action === "stop_watcher") {
        const result = await controlWatcher("stop", resolvedProject);
        return { content: [{ type: "text", text: JSON.stringify({ ok: result.success, action: "stop_watcher", error: result.error }, null, 2) }] };
      }

      // --- Consolidation action ---
      if (action === "consolidate") {
        const result = await runLlmConsolidation(resolvedProject, false);
        return { content: [{ type: "text", text: JSON.stringify({ ok: result.success, action: "consolidate", ...result }, null, 2) }] };
      }

      // --- Default: status (includes everything) ---
      const [stats, healthState] = await Promise.all([
        buildStatsState(resolvedProject),
        buildHealthState(resolvedProject),
      ]);
      const qmdClient = await getQMDClient();
      const qmdAvailable = await qmdClient.isAvailable();

      // Enrich with watcher and consolidation status
      const [watcherStatus, consolidationCfg] = await Promise.all([
        getWatcherStatus(resolvedProject).catch(() => null),
        Promise.resolve(getConsolidationConfig()),
      ]);

      return { content: [{ type: "text", text: JSON.stringify({
        ok: true,
        ...stats,
        health: healthState,
        qmd: qmdAvailable ? "available" : "unavailable",
        watcher: watcherStatus,
        consolidation: consolidationCfg,
        version: SERVER_VERSION,
      }, null, 2) }] };
    }
  )) toolCount++;

  // squish_inspect - Explain why a memory was retained
  if (safeRegisterTool(
    server,
    "squish_inspect",
    {
      description: "Explain why a memory was retained, where it was routed, and whether raw fallback exists",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to inspect")
      }
    },
    async ({ memoryId }: { memoryId: string }) => {
      const inspection = await buildInspectState(memoryId);
      if (!inspection) {
        return errorResponse("not_found", "Memory not found", memoryId);
      }
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, inspection, version: SERVER_VERSION }, null, 2) }] };
    }
  )) toolCount++;

  console.error(`[MCP] Tool registration complete. Registered ${toolCount} tools.`);

  return { server, toolCount };
}

async function runStdio(server: McpServer, toolCount: number): Promise<void> {
  console.error(`[MCP] Starting in STDIO mode...`);
  const probe = await probeSchemaHealth();
  if (probe.status !== "ok") {
    console.error(`[MCP] Degraded startup: ${probe.detail}`);
    if (probe.remediation) {
      console.error(`[MCP] Remediation: ${probe.remediation}`);
    }
  }
  const transport = new StdioServerTransport();

  transport.onclose = () => {
    console.error(`[MCP] STDIO transport closed`);
  };

  await server.connect(transport);
  console.error(`[MCP] Connected via stdio. ${toolCount} tools available.`);

  // Keep process alive - wait for stdin to close
  // SIGINT/SIGTERM are handled by main()'s shutdown function
  await new Promise<void>((resolve) => {
    process.stdin.on('close', () => {
      console.error(`[MCP] STDIO stdin closed, shutting down`);
      resolve();
    });

    process.stdin.on('error', (error) => {
      console.error(`[MCP] STDIO stdin error:`, error.message);
      resolve();
    });
  });
}

async function runHttp(server: McpServer, port: number): Promise<void> {
  console.error(`[MCP] Starting in Streamable HTTP mode on port ${port}...`);
  const startupProbe = await probeSchemaHealth();
  if (startupProbe.status !== "ok") {
    console.error(`[MCP] Degraded startup: ${startupProbe.detail}`);
    if (startupProbe.remediation) {
      console.error(`[MCP] Remediation: ${startupProbe.remediation}`);
    }
  }

  const app = express();
  app.use(express.json());

  // Store transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Clean up stale sessions every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, transport] of transports) {
      const lastActivity = (transport as any)._lastActivity;
      if (lastActivity && now - lastActivity > 30 * 60 * 1000) {
        console.error(`[MCP] Cleaning up stale session: ${sid}`);
        transport.close().catch(() => {});
        transports.delete(sid);
      }
    }
  }, 5 * 60 * 1000);

  // Clear interval on shutdown
  process.on('SIGTERM', () => clearInterval(cleanupInterval));
  process.on('SIGINT', () => clearInterval(cleanupInterval));

  // CORS for web-based MCP clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, x-api-key, authorization');
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Helper to check if request is an initialization request
  function isInitializeRequest(body: any): boolean {
    return body?.method === 'initialize';
  }

  // Health check endpoint
  app.get("/health", (req, res) => {
    void probeSchemaHealth().then((probe) => {
      res.json({
        status: probe.status === "ok" ? "ok" : (probe.status === "drifted" ? "degraded" : "broken"),
        server: SERVER_NAME,
        version: SERVER_VERSION,
        backend: probe.backend,
        detail: probe.detail,
        remediation: probe.remediation,
        missingTables: probe.missingTables,
      });
    }).catch((error: any) => {
      res.status(500).json({
        status: "broken",
        server: SERVER_NAME,
        version: SERVER_VERSION,
        detail: error?.message ?? "Health check failed",
      });
    });
  });

  // API key auth for HTTP mode - MANDATORY for security (H-01)
  const MCP_API_KEY = process.env.SQUISH_MCP_API_KEY || '';
  if (!MCP_API_KEY) {
    console.error(`[MCP] FATAL: HTTP mode requires SQUISH_MCP_API_KEY to be set. Refusing to start without authentication.`);
    process.exit(1);
  }
  function checkMcpAuth(req: express.Request, res: express.Response): boolean {
    const provided = req.headers['x-api-key'] as string || req.headers['authorization']?.replace('Bearer ', '') || '';
    if (provided !== MCP_API_KEY) {
      res.status(401).json({ error: 'Unauthorized. Set SQUISH_MCP_API_KEY or provide x-api-key header.' });
      return false;
    }
    return true;
  }

  // Streamable HTTP POST endpoint
  app.post("/mcp", async (req, res) => {
    if (!checkMcpAuth(req, res)) return;

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const body = req.body;

    let transport: StreamableHTTPServerTransport | undefined;
    let serverToUse: McpServer | undefined;

    // Check if we have an existing transport for this session
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
      serverToUse = server;
    }

    // If no existing transport, create new one (only for initialize requests)
    if (!transport) {
      if (!isInitializeRequest(body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID and not an initialize request' },
          id: body?.id || null
        });
        return;
      }

      // Create NEW server instance for this session (required - can't reuse)
      const { server: newServer } = createSquishServer();
      serverToUse = newServer;

      // Create new transport with JSON response mode
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId: string) => {
          console.error(`[MCP] Session initialized: ${newSessionId}`);
          transports.set(newSessionId, transport!);
        }
      });

      // Connect the NEW session-specific server to this transport
      try {
        await serverToUse.connect(transport);
      } catch (connectError: any) {
        // Ignore "Already connected" errors - can happen if server was used before
        if (connectError.message?.includes('Already connected')) {
          console.error(`[MCP] Server already connected, creating fresh server...`);
          const { server: freshServer } = createSquishServer();
          serverToUse = freshServer;
          await serverToUse.connect(transport);
        } else {
          console.error(`[MCP] Connect error:`, connectError.message);
        }
      }

      // Set up onclose handler
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid) {
          console.error(`[MCP] Session closed: ${sid}`);
          transports.delete(sid);
        }
      };

      transport.onerror = (error) => {
        console.error(`[MCP] Transport error:`, error);
      };
    }

    try {
      // Handle the request with the parsed body
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error(`[MCP] Error handling request:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Streamable HTTP GET endpoint (for SSE)
  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.get(sessionId)!;

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(`[MCP] Error handling GET request:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // DELETE endpoint to close session
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.get(sessionId)!;

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(`[MCP] Error handling DELETE request:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  await new Promise<void>((resolve) => app.listen(port, () => {
    console.error(`[MCP] HTTP server listening on port ${port}`);
    console.error(`[MCP] Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    console.error(`[MCP] Health: http://localhost:${port}/health`);
    resolve();
  }));
}

async function runHealthCheck(): Promise<void> {
  console.error(`[MCP] Running health check...`);

  try {
    const { server, toolCount } = createSquishServer();
    const probe = await probeSchemaHealth();
    console.error(`[MCP] Health check passed. Server initialized with ${toolCount} tools.`);
    if (probe.status !== "ok") {
      console.error(`[MCP] Degraded: ${probe.detail}`);
      if (probe.remediation) {
        console.error(`[MCP] Remediation: ${probe.remediation}`);
      }
    }
    process.exit(probe.status === "unavailable" ? 1 : 0);
  } catch (error) {
    console.error(`[MCP] Health check failed:`, error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    console.error(`[${SERVER_NAME}] v${SERVER_VERSION} initializing...`);
    console.error(`[${SERVER_NAME}] Mode: local`);
    console.error(`[${SERVER_NAME}] Embeddings: ${config.embeddingsProvider}`);

    const { mode, port, health } = parseArgs();

    if (health) {
      await runHealthCheck();
      return;
    }

    // Initialize cron scheduler for scheduled jobs
    try {
      await initializeScheduler();
      console.error(`[${SERVER_NAME}] Cron scheduler initialized`);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Warning: Failed to initialize scheduler:`, error);
    }

    const shutdown = async () => {
      console.error(`[${SERVER_NAME}] Shutting down...`);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (mode === "stdio") {
      await runStdio(SQUISH_SERVER, SQUISH_TOOL_COUNT);
    } else {
      await runHttp(SQUISH_SERVER, port);
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
