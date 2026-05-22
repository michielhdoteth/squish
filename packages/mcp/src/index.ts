#!/usr/bin/env node

// CRITICAL: Redirect console.log to stderr to prevent JSON-RPC stream corruption
// MCP stdio requires stdout to contain ONLY valid JSON-RPC messages
console.log = console.error;
console.info = console.error;

// Load .env file for config
import 'dotenv/config';

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { config, detectProjectScope } from "../../../config.js";
import { getDb } from "../../../db/index.js";
import { getSchema } from "../../../db/schema.js";
import { isSchemaDriftError, probeSchemaHealth, type SchemaProbeResult } from "../../../db/schema-health.js";
import { eq } from "drizzle-orm";
import { startWorker, stopWorker } from "../../../core/worker.js";
import { initializeScheduler } from "../../../core/scheduler/cron-scheduler.js";
import { parseDate, filterByDateRange } from "../../../core/lib/utils.js";
import {
  buildContextState,
  buildHealthState,
  buildInspectState,
  buildStatsState,
  resolveProjectScope,
} from "../../../core/runtime/trust-state.js";
import { rememberMemory, search as searchMemories, getMemory, getRecent, type MemoryType } from "../../../core/memory/memories.js";
import { getQMDClient } from "../../../core/embeddings/qmd-client.js";
import { createAssociation, getRelatedMemories, type AssociationType } from "../../../core/associations.js";
import { createLearning } from "../../../core/ingestion/learnings.js";
import { getAllProjects } from "../../../core/projects.js";
import { logger } from "../../../core/logger.js";

const SERVER_NAME = "squish-memory";
const SERVER_VERSION = "1.3.0";

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
      if (name !== "squish_health") {
        const probe = await probeSchemaHealth();
        if (probe.status !== "ok") {
          return schemaProbeErrorResult(probe);
        }
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

/**
 * Resolve the effective project path for an MCP tool.
 * Priority: explicit project argument > auto-detected from env/cwd > null (global)
 */
function resolveProjectPath(projectArg?: string): string | null | undefined {
  if (projectArg) return projectArg;
  return detectProjectScope();
}

function createSquishServer(): { server: McpServer; toolCount: number } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  let toolCount = 0;

  console.error(`[MCP] Starting tool registration...`);

  // squish_timeline - 3-layer progressive disclosure
  if (safeRegisterTool(
    server,
    "squish_timeline",
    {
      description: "3-layer progressive disclosure - index (~50 tokens), timeline (~200 tokens), detail (~2000 tokens)",
      inputSchema: {
        query: z.string().describe("Search query"),
        depth: z.enum(["index", "timeline", "detail"]).default("index").describe("Progressive disclosure depth"),
        limit: z.number().min(1).max(100).default(10).describe("Max results"),
        project: z.string().optional().describe("Project path")
      }
    },
    async ({ query, depth = "index", limit = 10, project }: { query: string; depth?: "index" | "timeline" | "detail"; limit?: number; project?: string }) => {
      const { getTimeline } = await import('../../../core/adapters/timeline.js');
      const resolvedProject = resolveProjectPath(project);
      const result = await getTimeline(query, depth, limit, resolvedProject);

      const formatted = result.results.map((r: any, i: number) => {
        if (depth === "index") {
          return `${i + 1}. ${r.title}`;
        } else if (depth === "timeline") {
          return `${i + 1}. [${r.type}] ${r.content} (${r.tags?.join(', ') || 'no tags'})`;
        } else {
          return `${i + 1}. [${r.type}] ${r.content?.substring(0, 200)}...`;
        }
      }).join("\n");

      return { content: [{ type: "text", text: `Timeline (${depth}, ~${result.tokenEstimate} tokens):\n\n${formatted}` }] };
    }
  )) toolCount++;

  // squish_remember - UNIFIED MEMORY WRITE
  // Single smart write path: auto-detects intent and routes to memory or learning
  if (safeRegisterTool(
    server,
    "squish_remember",
    {
      description: "Store any memory or learning. System auto-detects type and routes appropriately. This is THE memory write tool for agents - handles confidence and all memory types.",
      inputSchema: {
        content: z.string().describe("What to remember - can be a fact, decision, lesson, observation, or note"),
        project: z.string().optional().describe("Project path (auto-detected if not provided)"),
        user: z.string().optional().describe("User identifier (name or email) to associate with this memory"),
        tags: z.array(z.string()).optional().describe("Optional tags for organization"),
        type: z.enum(["observation", "fact", "decision", "context", "preference", "note"]).optional().describe("Memory type - auto-detected if not provided"),
        learningType: z.enum(["success", "failure", "fix", "insight"]).optional().describe("Learning type when routing to learning storage"),
        confidence: z.number().min(0).max(100).optional().describe("Confidence level 0-100 (default: auto-calculated)"),
        source: z.string().optional().describe("Source of memory: mcp, cli, voice, chat, document (default: mcp)"),
        route: z.enum(["auto", "memory", "learning", "note"]).default("auto").describe("Force routing: auto=detect, memory=store as memory, learning=store as learning, note=store as note"),
        pin: z.boolean().default(false).describe("Pin memory to prevent pruning/consolidation"),
        unpin: z.boolean().default(false).describe("Unpin memory")
      }
    },
    async ({ content, project, user, tags = [], type, learningType, confidence, source, route = "auto", pin = false, unpin = false }: {
      content: string;
      project?: string;
      user?: string;
      tags?: string[];
      type?: "observation" | "fact" | "decision" | "context" | "preference" | "note";
      learningType?: "success" | "failure" | "fix" | "insight";
      confidence?: number;
      source?: string;
      route?: "auto" | "memory" | "learning" | "note";
      pin?: boolean;
      unpin?: boolean;
    }) => {
      // Import detection function
      const { detectMemorySignals } = await import('../../../core/memory/trigger-detector.js');
      const signals = detectMemorySignals(content);
      const resolvedProject = resolveProjectPath(project);

      let routing: "memory" | "learning" | "note" = "memory";
      let inferredType = type || signals.suggestedType;
      let routingReason = "";

      // Check for learning patterns if auto mode
      if (route === "auto") {
        const hasLessonPattern = /(\bfailed\s+because\b|\blesson\s+learned\b|\bnext\s+time\b|\broot\s+cause\b|\bsuccess\b.*\bbecause\b|\bi\s+learned\b|\binsight\b)/i.test(content);
        const hasLearningType = /(\bsuccess\b|\bfailure\b|\bfix\b|\binsight\b)/i.test(content);

        // Enhanced learning detection from rationale patterns
        const hasHackPattern = /(\bHACK\b|\bworkaround\b|\btemporary\s+fix\b)/i.test(content);
        const hasFixmePattern = /(\bFIXME\b|\bXXX\b|\bbug\b.*\bfix\b)/i.test(content);

        if (hasLessonPattern || hasLearningType || hasHackPattern || hasFixmePattern) {
          routing = "learning";
          if (hasHackPattern || hasFixmePattern) {
            routingReason = "Detected code pattern (HACK/FIXME)";
          } else {
            routingReason = "Detected learning pattern in content";
          }
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
      } else if (route === "learning") {
        routing = "learning";
        routingReason = "Override: forced to learning";
      } else if (route === "note") {
        routing = "note";
        routingReason = "Override: forced to note";
      } else {
        routing = "memory";
        routingReason = "Override: forced to memory";
      }

      let result: any;

      if (routing === "learning") {
        // Determine learning type from content or override
        let finalLearningType = learningType || "insight";
        if (!learningType) {
          if (/(\bsuccess\b|\bworked\b|\bfinished\b)/i.test(content)) finalLearningType = "success";
          else if (/(\bfailed\b|\berror\b|\bbroke\b)/i.test(content)) finalLearningType = "failure";
          else if (/(\bfix\b|\b workaround\b|\bsolved\b)/i.test(content)) finalLearningType = "fix";
        }

        const learning = await createLearning({
          type: finalLearningType,
          content,
          project: resolvedProject,
          autoLink: true
        });
        result = { id: learning.id, type: "learning", learningType: finalLearningType, content };
      } else {
        // Store as memory with all options
        const memory = await rememberMemory({
          content,
          type: inferredType as any,
          tags,
          project: resolvedProject,
          user,
          source: source || 'mcp'
        });

        // Handle pin/unpin after creation
        if (pin) {
          const { pinMemory } = await import('../../../core/security/governance.js');
          await pinMemory(memory.id);
        } else if (unpin) {
          const { unpinMemory } = await import('../../../core/security/governance.js');
          await unpinMemory(memory.id);
        }

        result = { id: memory.id, type: "memory", memoryType: inferredType, content, pined: pin };

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
          text: `Remembered: ${result.id}\nRouting: ${routing}\nType: ${routing === "learning" ? result.learningType : result.memoryType}\nPriority: ${signals.priority}\nConfidence: ${signals.confidence}\nPined: ${(result as any).pinned}\nReason: ${routingReason}\n\n${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
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
      inputSchema: {
        query: z.string().describe("Query text or memory ID to recall"),
        limit: z.number().min(1).max(100).default(5).describe("Maximum results for query recall"),
        project: z.string().optional().describe("Project path filter"),
        user: z.string().optional().describe("Filter by user (name or email)"),
        type: z.enum(["observation", "fact", "decision", "context", "preference", "note", "task"]).optional().describe("Filter by memory type"),
        place: z.string().optional().describe("Filter by place (inbox, ref, wip, sandbox, board, sparks, archive)")
      }
    },
    async ({ query, limit = 5, project, user, type, place }: { query: string; limit?: number; project?: string; user?: string; type?: MemoryType; place?: string }) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      const resolvedProject = resolveProjectPath(project);

      if (isUuid) {
        const memory = await getMemory(query);
        if (!memory) {
          return { content: [{ type: "text", text: `Memory not found: ${query}` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: 1, results: [memory] }, null, 2) }] };
      }

      const results = await searchMemories({
        query,
        limit,
        project: resolvedProject,
        user,
        type,
        placeType: place
      });

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: results.length, results }, null, 2) }] };
    }
  )) toolCount++;

  // squish_forget - Delete a memory by ID, or bulk delete with filters
  if (safeRegisterTool(
    server,
    "squish_forget",
    {
      description: "Delete a memory by ID, or bulk delete with filters (older-than, search, type)",
      inputSchema: {
        memoryId: z.string().optional().describe("Memory ID to delete (single)"),
        olderThan: z.string().optional().describe("Bulk delete memories older than (e.g., '30 days', '6 months')"),
        search: z.string().optional().describe("Search query to match specific memories"),
        type: z.string().optional().describe("Filter by memory type"),
        confirm: z.boolean().optional().describe("Actually delete (default is dry-run)"),
        limit: z.number().optional().describe("Max memories to delete"),
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ memoryId, olderThan, search, type, confirm = false, limit = 100, project }: { memoryId?: string; olderThan?: string; search?: string; type?: string; confirm?: boolean; limit?: number; project?: string }) => {
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      // Auto-detect project if not provided, but allow truly global (null) scope
      const resolvedProject = resolveProjectPath(project);
      const proj = resolvedProject || undefined;

      // Single memory deletion
      if (memoryId) {
        await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
        return { content: [{ type: "text", text: `Memory deleted: ${memoryId}` }] };
      }

      // Bulk deletion
      if (!olderThan && !search) {
        return { content: [{ type: "text", text: "Error: Provide memoryId or use --older-than / --search for bulk delete" }], isError: true };
      }

      const results = await searchMemories({ query: search || '', type: type as MemoryType, limit, project: proj });

      let filtered = results;
      if (olderThan) {
        filtered = filterByDateRange(results, '', olderThan);
      }

      const deleted = [];
      if (confirm) {
        for (const mem of filtered) {
          await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, mem.id));
          deleted.push(mem.id);
        }
      }

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, matched: filtered.length, deleted: deleted.length, dryRun: !confirm }, null, 2) }] };
    }
  )) toolCount++;


  // squish_link - Unified graph operations (find related, add links, list)
  if (safeRegisterTool(
    server,
    "squish_link",
    {
      description: "Manage memory associations: find related memories, add links, or list associations",
      inputSchema: {
        action: z.enum(["find", "add", "list"]).describe("Action: find, add, or list"),
        memoryId: z.string().optional().describe("Memory ID (for find action)"),
        fromMemoryId: z.string().optional().describe("Source memory ID (for add action)"),
        toMemoryId: z.string().optional().describe("Target memory ID (for add action)"),
        type: z.string().optional().describe("Association type (for add action): relates_to, supports, contradicts, supersedes, duplicate"),
        weight: z.number().min(0).max(1).default(0.5).describe("Association strength (0-1)"),
        depth: z.number().min(1).max(5).default(2).describe("Graph traversal depth (for find action)"),
        minWeight: z.number().min(0).max(1).default(0.3).describe("Minimum weight (for find action)")
      }
    },
    async ({ action, memoryId, fromMemoryId, toMemoryId, type = "relates_to", weight = 0.5, depth = 2, minWeight = 0.3 }: { action: "find" | "add" | "list"; memoryId?: string; fromMemoryId?: string; toMemoryId?: string; type?: string; weight?: number; depth?: number; minWeight?: number }) => {
      if (action === "find") {
        if (!memoryId) {
          return { content: [{ type: "text", text: "Error: memoryId required for find action" }], isError: true };
        }
        const related = await getRelatedMemories(memoryId, depth * 5);
        const filtered = related.filter((r: any) => r.weight >= minWeight);
        const formatted = filtered.map((r: any, i: number) =>
          `${i + 1}. [${r.type || "memory"}] ${r.content?.substring(0, 100)}... (weight: ${r.weight?.toFixed(2)})`
        ).join("\n");
        return { content: [{ type: "text", text: `Found ${filtered.length} related memories:\n\n${formatted}` }] };
      }

      if (action === "add") {
        if (!fromMemoryId || !toMemoryId) {
          return { content: [{ type: "text", text: "Error: fromMemoryId and toMemoryId required for add action" }], isError: true };
        }
        await createAssociation(fromMemoryId, toMemoryId, type as AssociationType, weight);

        // Auto-update knowledge graph (fire-and-forget)
        try {
          const { addMemoryToGraph } = await import('../../../core/graph/graph-builder.js');
          await Promise.all([
            addMemoryToGraph(fromMemoryId).catch(() => null),
            addMemoryToGraph(toMemoryId).catch(() => null)
          ]);
        } catch (e) {
          // Ignore graph errors
        }

        return { content: [{ type: "text", text: `Association created: ${fromMemoryId} -> ${toMemoryId} (${type})` }] };
      }

      if (action === "list") {
        const db = await getDb();
        const schema = await getSchema();
        const sqliteDb = db as any;
        const associations = await sqliteDb.select().from(schema.memoryAssociations).limit(100);
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: associations.length, associations }, null, 2) }] };
      }

      return { content: [{ type: "text", text: "Error: invalid action. Use find, add, or list" }], isError: true };
    }
  )) toolCount++;

  // squish_context - Get project context or list registered projects
  if (safeRegisterTool(
    server,
    "squish_context",
    {
      description: "Get project context or list registered projects",
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
            }, null, 2),
          }],
        };
      }

      const context = await buildContextState(resolvedProject, limit);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...context }, null, 2) }] };
    }
  )) toolCount++;

  // squish_health - Check Squish system health status
  if (safeRegisterTool(
    server,
    "squish_health",
    {
      description: "Check Squish system health status",
      inputSchema: {
        project: z.string().optional().describe("Project path")
      }
    },
    async ({ project }: { project?: string }): Promise<{ content: Array<{ type: string; text: string }> }> => {
      const qmdClient = await getQMDClient();
      const qmdAvailable = await qmdClient.isAvailable();
      const resolvedProject = resolveProjectPath(project);
      const health = await buildHealthState(resolvedProject);

      return { content: [{ type: "text", text: JSON.stringify({
        ok: health.severity !== "broken",
        version: SERVER_VERSION,
        qmd: qmdAvailable ? "available" : "unavailable",
        timestamp: new Date().toISOString(),
        ...health,
      }, null, 2) }] };
    }
  )) toolCount++;

  // squish_stats - Get memory statistics for a project
  if (safeRegisterTool(
    server,
    "squish_stats",
    {
      description: "Get memory statistics (global if no project)",
      inputSchema: {
        project: z.string().optional().describe("Project path filter (global if omitted)")
      }
    },
    async ({ project }: { project?: string }) => {
      const resolvedProject = resolveProjectPath(project);
      const stats = await buildStatsState(resolvedProject);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...stats }, null, 2) }] };
    }
  )) toolCount++;

  // squish_inspect - Explain why a memory was retained
  if (safeRegisterTool(
    server,
    "squish_inspect",
    {
      description: "Explain why a memory was retained, where it was routed, and whether raw fallback exists",
      inputSchema: {
        memoryId: z.string().uuid().describe("Memory ID to inspect")
      }
    },
    async ({ memoryId }: { memoryId: string }) => {
      const inspection = await buildInspectState(memoryId);
      if (!inspection) {
        return { content: [{ type: "text", text: `Memory not found: ${memoryId}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, inspection }, null, 2) }] };
    }
  )) toolCount++;

  // squish_pin - Pin or unpin a memory to prevent consolidation
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

  // squish_recent - Get recent memories by period
  if (safeRegisterTool(
    server,
    "squish_recent",
    {
      description: "Get recent memories by period (today, yesterday, thisweek, 7days, 30days, or custom)",
      inputSchema: {
        period: z.string().optional().describe("Period: today, yesterday, thisweek, 7days, 14days, 30days, 90days"),
        since: z.string().optional().describe("Start date (alternative to period, e.g., '3 days', '2026-01-01')"),
        until: z.string().optional().describe("End date (alternative to period, e.g., 'now', '2026-01-15')"),
        limit: z.number().optional().describe("Max results to return"),
        project: z.string().optional().describe("Project path filter (global if omitted)")
      }
    },
    async ({ period = 'today', since, until, limit = 10, project }: { period?: string; since?: string; until?: string; limit?: number; project?: string }) => {
      const proj = resolveProjectPath(project); // auto-detect if undefined
      let sinceDate: string, untilDate: string;

      if (since && until) {
        sinceDate = since;
        untilDate = until;
      } else if (since) {
        sinceDate = since;
        untilDate = 'now';
      } else {
        const periodMap: Record<string, [string, string]> = {
          today: ['today', 'now'],
          yesterday: ['yesterday', 'today'],
          thisweek: ['thisweek', 'now'],
          '7days': ['7 days', 'now'],
          '14days': ['14 days', 'now'],
          '30days': ['30 days', 'now'],
          '90days': ['90 days', 'now'],
        };
        const mapped = periodMap[period];
        if (mapped) {
          [sinceDate, untilDate] = mapped;
        } else {
          sinceDate = period;
          untilDate = 'now';
        }
      }

      const results = await getRecent(proj, 100);
      const filtered = filterByDateRange(results, sinceDate, untilDate);
      const limited = filtered.slice(0, limit);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, period, since: sinceDate, until: untilDate, count: limited.length, results: limited }, null, 2) }] };
    }
  )) toolCount++;

  // squish_stale - Show stale memories
  if (safeRegisterTool(
    server,
    "squish_stale",
    {
      description: "Show stale memories (old, low-confidence, or rarely accessed)",
      inputSchema: {
        days: z.number().optional().describe("Show memories older than N days"),
        limit: z.number().optional().describe("Max results to return"),
        project: z.string().optional().describe("Project path filter (global if omitted)")
      }
    },
    async ({ days = 30, limit = 20, project }: { days?: number; limit?: number; project?: string }) => {
      const proj = resolveProjectPath(project); // auto-detect if undefined
      const cutoffDate = new Date(Date.now() - days * 86400000);
      const results = await getRecent(proj, 500);
      const stale = results.filter((m: any) => {
        const created = m.createdAt ? new Date(m.createdAt) : null;
        const isOld = created && created < cutoffDate;
        const isLowConfidence = m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative';
        const hasLowImportance = (m.importance || 50) < 40;
        return isOld || isLowConfidence || hasLowImportance;
      });
      const limited = stale.slice(0, limit);
      const summary = {
        totalStale: stale.length,
        old: stale.filter((m: any) => m.createdAt && new Date(m.createdAt) < cutoffDate).length,
        lowConfidence: stale.filter((m: any) => m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative').length,
        lowImportance: stale.filter((m: any) => (m.importance || 50) < 40).length,
      };
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, summary, memories: limited }, null, 2) }] };
    }
  )) toolCount++;

  // squish_list_pinned - List all pinned memories
  if (safeRegisterTool(
    server,
    "squish_list_pinned",
    {
      description: "List all pinned memories (pinned memories are always preserved)",
      inputSchema: {
        project: z.string().optional().describe("Project path (optional, uses current project if omitted)")
      }
    },
    async ({ project }: { project?: string }) => {
      const { getPinnedMemories } = await import('../../../core/security/governance.js');
      const resolvedProject = resolveProjectPath(project);
      const pinned = await getPinnedMemories(resolvedProject);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: pinned.length, pinned }, null, 2) }] };
    }
  )) toolCount++;

  // squish_on_session_start - Trigger session start
  if (safeRegisterTool(
    server,
    "squish_on_session_start",
    {
      description: "Trigger session start - injects context from previous sessions, initializes session tracking",
      inputSchema: {
        projectPath: z.string().optional().describe("Project path (global if omitted)"),
        mode: z.enum(["startup", "resume", "compact"]).default("startup").describe("Session mode")
      }
    },
    async ({ projectPath, mode = "startup" }: { projectPath?: string; mode?: "startup" | "resume" | "compact" }) => {
      const { handleSessionStart } = await import('../../../core/hooks/agent-hooks.js');
      const resolvedProjectPath = resolveProjectPath(projectPath);
      const result = await handleSessionStart({
        projectPath: resolvedProjectPath,
        mode,
        agentType: 'opencode'
      });
      return {
        content: [{
          type: "text",
          text: `Session started: ${result.sessionId}\nMemories injected: ${result.count}\n\n${result.memories?.join('\n') || 'No recent memories'}`
        }]
      };
    }
  )) toolCount++;

  // squish_on_tool_use - Capture tool use event
  if (safeRegisterTool(
    server,
    "squish_on_tool_use",
    {
      description: "Capture a tool use event for memory - stores observation about tool execution",
      inputSchema: {
        toolName: z.string().describe("Name of the tool used"),
        toolInput: z.record(z.string(), z.any()).describe("Tool input/arguments"),
        toolResult: z.any().optional().describe("Tool result/output"),
        projectPath: z.string().optional().describe("Project path")
      }
    },
    async ({ toolName, toolInput, toolResult, projectPath }: { toolName: string; toolInput: Record<string, any>; toolResult?: any; projectPath?: string }) => {
      const { handleToolUse } = await import('../../../core/hooks/agent-hooks.js');
      const resolvedProjectPath = resolveProjectPath(projectPath);
      const result = await handleToolUse({
        toolName,
        toolInput,
        toolResult,
        projectPath: resolvedProjectPath,
        agentType: 'opencode'
      });
      return {
        content: [{
          type: "text",
          text: `Tool use captured: ${toolName}\nObservation stored: ${result.observationId}\nMemory ID: ${result.memoryId || 'N/A'}`
        }]
      };
    }
  )) toolCount++;

  // squish_on_session_end - Trigger session end
  if (safeRegisterTool(
    server,
    "squish_on_session_end",
    {
      description: "Trigger session end - performs cleanup and signals session completion",
      inputSchema: {
        projectPath: z.string().optional().describe("Project path (global if omitted)")
      }
    },
    async ({ projectPath }: { projectPath?: string }) => {
      const { handleSessionEnd } = await import('../../../core/hooks/agent-hooks.js');
      const resolvedProjectPath = resolveProjectPath(projectPath);
      const result = await handleSessionEnd({
        projectPath: resolvedProjectPath,
        agentType: 'opencode'
      });
      return {
        content: [{
          type: "text",
          text: `Session ended: ${result.sessionId}\nConsolidated: ${result.consolidatedCount} memories\nCleaned up: ${result.cleanedUpCount} stale entries`
        }]
      };
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
  console.error(`[MCP] Starting in Streamable HTTP mode on port ${port}...`);
  const startupProbe = await probeSchemaHealth();
  if (startupProbe.status !== "ok") {
    console.error(`[MCP] Degraded startup: ${startupProbe.detail}`);
    if (startupProbe.remediation) {
      console.error(`[MCP] Remediation: ${startupProbe.remediation}`);
    }
  }

  const app = express();
  app.use(express.json({ strict: false }));

  // Store transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

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

  // API key auth for HTTP mode
  const MCP_API_KEY = process.env.SQUISH_MCP_API_KEY || '';
  if (!MCP_API_KEY) {
    console.warn(`[MCP] WARNING: HTTP mode without SQUISH_MCP_API_KEY - API is accessible to all localhost clients`);
  }
  function checkMcpAuth(req: express.Request, res: express.Response): boolean {
    if (!MCP_API_KEY) return true; // No key configured = localhost-only assumed
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
    console.error(`[${SERVER_NAME}] Mode: ${config.isManagedMode ? "managed" : "local"}`);
    console.error(`[${SERVER_NAME}] Embeddings: ${config.embeddingsProvider}`);

    const { mode, port, health } = parseArgs();

    if (health) {
      await runHealthCheck();
      return;
    }

    // Start background worker for lifecycle maintenance, decay, etc.
    try {
      await startWorker();
      console.error(`[${SERVER_NAME}] Background worker started`);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Warning: Failed to start background worker:`, error);
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
      try {
        await stopWorker();
        console.error(`[${SERVER_NAME}] Background worker stopped`);
      } catch (error) {
        console.error(`[${SERVER_NAME}] Error stopping worker:`, error);
      }
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
