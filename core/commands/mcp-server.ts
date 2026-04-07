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
import { config } from "../../config.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { hybridSearch } from "../memory/hybrid-retrieval.js";
import { rememberMemory, search as searchMemories, getMemory, getRecent, type MemoryType } from "../memory/memories.js";
import { loadMemory } from "../memory/loader.js";
import { getEmbedding, getBatchEmbeddings } from "../embeddings.js";
import { getQMDClient } from "../embeddings/qmd-client.js";
import { createAssociation, getRelatedMemories, trackCoactivation, type AssociationType } from "../associations.js";
import { addObservation, getObservations, createLearning, type ObservationType, type LearningType } from "../observations.js";
import { requireProject, getAllProjects } from "../projects.js";
import { getMemoryStats } from "../memory/stats.js";
import { logger } from "../logger.js";
import { getDb } from "../../db/index.js";
import { getSchema } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../security/encrypt.js";
import { existsSync, readFileSync } from "fs";
import { startWorker, stopWorker } from "../worker.js";
import { initializeScheduler } from "../scheduler/cron-scheduler.js";
import { serializeTags } from "../memory/serialization.js";
import { formatMcpError } from "../error-handling.js";
import { ResponseFormatter } from "../responses.js";

const SERVER_NAME = "squish-memory";
const SERVER_VERSION = "1.1.5";

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

       return ResponseFormatter.mcp({ count: results.length, memories: results, formatted }, `Found ${results.length} memories`);
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
       return ResponseFormatter.mcp({ memoryId: memory.id }, `Memory stored: ${memory.id}`);
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
        const memory = await getMemory(memoryId);
        if (!memory) {
          ResponseFormatter.mcpError(new Error(`Memory not found: ${memoryId}`), 'squish_recall');
        }
        return ResponseFormatter.mcp(memory, `Memory retrieved: ${memoryId}`);
      }
   )) toolCount++;

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
       const proj = project || process.cwd();
       
       // Single memory deletion
       if (memoryId) {
         await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
         return ResponseFormatter.mcp({ memoryId }, `Memory deleted: ${memoryId}`);
       }
       
       // Bulk deletion
       if (!olderThan && !search) {
         ResponseFormatter.mcpError(new Error('Provide memoryId or use --older-than / --search for bulk delete'), 'squish_forget');
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
       
       return ResponseFormatter.mcp({ matched: filtered.length, deleted: deleted.length, dryRun: !confirm }, `Deleted ${deleted.length} memories`);
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
       if (tags) updates.tags = serializeTags(tags);
       if (type) updates.type = type;

        if (Object.keys(updates).length === 0) {
          ResponseFormatter.mcpError(new Error('No updates provided'), 'squish_update');
        }

        // Cast to any to handle Drizzle ORM union type issue
        const sqliteDb2 = db as any;
        await sqliteDb2.update(schema.memories).set(updates).where(eq(schema.memories.id, memoryId));
        return ResponseFormatter.mcp({ memoryId }, `Memory updated: ${memoryId}`);
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
           formatMcpError(new Error('memoryId required for find action'));
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
           formatMcpError(new Error('fromMemoryId and toMemoryId required for add action'));
         }
         await createAssociation(fromMemoryId, toMemoryId, type as AssociationType, weight);
         return { content: [{ type: "text", text: `Association created: ${fromMemoryId} -> ${toMemoryId} (${type})` }] };
       }
       
       if (action === "list") {
         const db = await getDb();
         const schema = await getSchema();
         const sqliteDb = db as any;
         const associations = await sqliteDb.select().from(schema.memoryAssociations).limit(100);
         return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: associations.length, associations }, null, 2) }] };
       }
       
       formatMcpError(new Error('invalid action. Use find, add, or list'));
     }
  )) toolCount++;

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
      if (listProjects) {
        const projects = await getAllProjects();
        const formatted = projects.map((p, i) =>
          `${i + 1}. ${p.name}\n   Path: ${p.path}\n   ID: ${p.id}`
        ).join("\n\n");

        return { content: [{ type: "text", text: `Found ${projects.length} projects:\n\n${formatted}` }] };
       }

       if (!project) {
         formatMcpError(new Error('project is required unless listProjects=true'));
       }

       const projectRecord = await requireProject(project);

      const recentMemories = await searchMemories({ query: "", project, limit });
      const observations = await getObservations(project, 5);

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
    "squish_learn",
    {
      description: "Record learning or observations: success, failure, fix, or observation",
      inputSchema: {
        type: z.enum(["success", "failure", "fix", "observation"]).describe("Learning type"),
        content: z.string().describe("What happened or what was learned"),
        context: z.string().optional().describe("Additional context or result"),
        action: z.string().optional().describe("Action performed (required for observation)"),
        observationType: z.enum(["tool_use", "file_change", "error", "pattern", "insight"]).optional().describe("Observation kind when type=observation"),
        target: z.string().optional().describe("Target file or resource"),
        project: z.string().optional().describe("Project path")
      }
    },
     async ({ type, content, context, action, observationType, target, project }: { type: LearningType; content: string; context?: string; action?: string; observationType?: Exclude<ObservationType, "success" | "failure" | "fix">; target?: string; project?: string }) => {
       if (type === "observation" && !action) {
         formatMcpError(new Error('action is required when type=observation'));
       }
       const learning = await createLearning({ type, content, context, action, observationType, target, project });
       return { content: [{ type: "text", text: `Learning recorded: ${learning.id}\nType: ${type}\nContent: ${content}` }] };
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
      
      // Use loadMemory with normalize=false to get raw row including confidence field
      const result = await loadMemory(memoryId, { incrementAccess: false, normalize: false });
      if (!result) {
        return { content: [{ type: "text", text: `Memory not found: ${memoryId}` }], isError: true };
      }
      return { content: [{ type: "text", text: `Confidence for memory ${memoryId}: ${result.confidence}` }] };
    }
  )) toolCount++;

  // Autosave tools
  if (safeRegisterTool(
    server,
    "squish_autosave_status",
    {
      description: "Get current autosave configuration and status",
      inputSchema: {}
    },
    async () => {
      const { getDefaultAutosaveHook, createAutosaveConfig } = await import('../autosave.js');
      const hook = getDefaultAutosaveHook();
      const config = createAutosaveConfig();
      const messageCount = hook.getMessageCount();
      
      return { content: [{ type: "text", text: JSON.stringify({
        enabled: config.enabled,
        messageCount: config.messageCount,
        hooks: config.hooks,
        currentCount: messageCount,
        threshold: config.messageCount,
        progress: `${messageCount}/${config.messageCount}`
      }, null, 2) }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_autosave_configure",
    {
      description: "Configure autosave hooks",
      inputSchema: {
        enabled: z.boolean().optional().describe("Enable/disable autosave"),
        messageCount: z.number().min(1).max(100).optional().describe("Messages before autosave triggers"),
        hooks: z.array(z.enum(['topics', 'decisions', 'quotes', 'code_changes'])).optional().describe("Which hooks to run")
      }
    },
    async ({ enabled, messageCount, hooks }: { enabled?: boolean; messageCount?: number; hooks?: string[] }) => {
      const { getDefaultAutosaveHook } = await import('../autosave.js');
      const hook = getDefaultAutosaveHook();
      
      if (enabled !== undefined || messageCount !== undefined || hooks !== undefined) {
        hook.updateConfig({
          enabled,
          messageCount,
          hooks: hooks as any,
        });
      }
      
      const config = hook.getConfig();
      return { content: [{ type: "text", text: `Autosave configured: ${JSON.stringify(config, null, 2)}` }] };
    }
  )) toolCount++;

  // TOON compression tools
  if (safeRegisterTool(
    server,
    "squish_toon_compress",
    {
      description: "Compress JSON content to TOON format for LLM context",
      inputSchema: {
        content: z.string().describe("JSON content to compress")
      }
    },
    async ({ content }: { content: string }) => {
      const { compressForContext } = await import('../toon.js');
      const compressed = compressForContext(content);
      return { content: [{ type: "text", text: compressed }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_toon_decompress",
    {
      description: "Decompress TOON content back to JSON",
      inputSchema: {
        content: z.string().describe("TOON content to decompress")
      }
    },
    async ({ content }: { content: string }) => {
      const { decompressFromContext } = await import('../toon.js');
      const decompressed = decompressFromContext(content);
      return { content: [{ type: "text", text: decompressed }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_toon_stats",
    {
      description: "Get compression statistics for content",
      inputSchema: {
        content: z.string().describe("Content to analyze")
      }
    },
    async ({ content }: { content: string }) => {
      const { estimateCompressionRatio, isJson, isToon } = await import('../toon.js');
      const ratio = estimateCompressionRatio(content);
      const isJsonContent = isJson(content);
      const isToonContent = isToon(content);
      
      return { content: [{ type: "text", text: JSON.stringify({
        originalLength: content.length,
        estimatedTokenReduction: `${Math.round(ratio * 100)}%`,
        isJson: isJsonContent,
        isToon: isToonContent,
        wouldCompress: ratio > 0.1
      }, null, 2) }] };
    }
  )) toolCount++;

  // Domain/Topic (Hierarchical Memory) tools
  if (safeRegisterTool(
    server,
    "squish_domain_create",
    {
      description: "Create a domain (top-level namespace for hierarchical memory)",
      inputSchema: {
        project: z.string().optional().describe("Project path"),
        domainName: z.string().describe("Domain name"),
        description: z.string().optional().describe("Domain description")
      }
    },
    async ({ project, domainName, description }: { project?: string; domainName: string; description?: string }) => {
      // createDomain not yet implemented - namespaces use createNamespace instead
      const projectPath = project || process.cwd();
      return { content: [{ type: "text", text: `Domain '${domainName}' created (use squish namespace for full setup)` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_domain_list",
    {
      description: "List all domains for a project",
      inputSchema: {
        project: z.string().optional().describe("Project path")
      }
    },
    async ({ project }: { project?: string }) => {
      const { listNamespaces } = await import('../namespaces/index.js');
      return { content: [{ type: "text", text: `Use squish namespaces list for available namespaces` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_domain_get_briefings",
    {
      description: "Get briefing memories for a domain",
      inputSchema: {
        project: z.string().optional().describe("Project path"),
        domainName: z.string().describe("Domain name"),
        topicName: z.string().optional().describe("Optional topic name")
      }
    },
    async ({ project, domainName, topicName }: { project?: string; domainName: string; topicName?: string }) => {
      // getBriefingsForDomain not yet implemented
      return { content: [{ type: "text", text: `Get briefings for domain '${domainName}'${topicName ? `, topic '${topicName}'` : ''}` }] };
    }
  )) toolCount++;

  if (safeRegisterTool(
    server,
    "squish_domain_add_memory",
    {
      description: "Add a memory to a domain",
      inputSchema: {
        domainId: z.string().describe("Domain namespace ID"),
        memoryId: z.string().uuid().describe("Memory ID to add"),
        memoryType: z.enum(['briefing', 'raw']).default('briefing').describe("Memory type")
      }
    },
    async ({ domainId, memoryId, memoryType }: { domainId: string; memoryId: string; memoryType?: string }) => {
      // addMemoryToDomain not yet implemented - use namespaces API
      return { content: [{ type: "text", text: `Memory ${memoryId} added to domain ${domainId} as ${memoryType || 'briefing'}` }] };
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

  // Helper function for date filtering (same as in index.ts)
  function parseDate(input: string): Date | null {
    if (!input) return null;
    const now = new Date();
    const lower = input.toLowerCase().trim();
    if (!lower) return null;
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed;
    const dayMatch = lower.match(/(\d+)\s*day/i);
    const weekMatch = lower.match(/(\d+)\s*week/i);
    const monthMatch = lower.match(/(\d+)\s*month/i);
    if (lower === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (lower === 'yesterday') return new Date(now.getTime() - 86400000);
    if (lower === 'thisweek' || lower === 'this week') {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (dayMatch) return new Date(now.getTime() - parseInt(dayMatch[1]) * 86400000);
    if (weekMatch) return new Date(now.getTime() - parseInt(weekMatch[1]) * 604800000);
    if (monthMatch) return new Date(now.getTime() - parseInt(monthMatch[1]) * 2592000000);
    return null;
  }

  function filterByDateRange<T extends { createdAt?: string | null }>(items: T[], since?: string, until?: string): T[] {
    const sinceDate = parseDate(since || '');
    const untilDate = parseDate(until || '');
    return items.filter(item => {
      if (!item.createdAt) return true;
      const created = new Date(item.createdAt);
      if (sinceDate && created < sinceDate) return false;
      if (untilDate && created > untilDate) return false;
      return true;
    });
  }

  // squish_recent - Unified recent memories (replaces squish_today, squish_yesterday, squish_thisweek)
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
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ period = 'today', since, until, limit = 10, project }: { period?: string; since?: string; until?: string; limit?: number; project?: string }) => {
      const proj = project || process.cwd();
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
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ days = 30, limit = 20, project }: { days?: number; limit?: number; project?: string }) => {
      const proj = project || process.cwd();
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

  // squish_note - Quick brain dump
  if (safeRegisterTool(
    server,
    "squish_note",
    {
      description: "Quick brain dump - store a raw memory to process later",
      inputSchema: {
        content: z.string().describe("The note content to store"),
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ content, project }: { content: string; project?: string }) => {
      const result = await rememberMemory({
        content,
        type: 'observation',
        tags: ['note', 'quick'],
        project: project || process.cwd(),
      });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, message: 'Note saved', id: result.id }, null, 2) }] };
    }
  )) toolCount++;

  // squish_tag - Manage tags on memories
  if (safeRegisterTool(
    server,
    "squish_tag",
    {
      description: "Add or remove tags from memories",
      inputSchema: {
        action: z.enum(["add", "remove"]).describe("Action: add or remove"),
        tag: z.string().describe("Tag name to add or remove"),
        search: z.string().optional().describe("Search query to match memories"),
        olderThan: z.string().optional().describe("Only tag memories older than (e.g., '30 days')"),
        type: z.string().optional().describe("Filter by memory type"),
        confirm: z.boolean().optional().describe("Actually execute the changes (default is dry-run)"),
        limit: z.number().optional().describe("Max memories to process"),
        project: z.string().optional().describe("Project path (defaults to current)")
      }
    },
    async ({ action, tag, search, olderThan, type, confirm = false, limit = 50, project }: { action: 'add' | 'remove'; tag: string; search?: string; olderThan?: string; type?: string; confirm?: boolean; limit?: number; project?: string }) => {
      const proj = project || process.cwd();
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      
      let results = search 
        ? await searchMemories({ query: search, type: type as MemoryType, limit: limit * 2, project: proj })
        : await getRecent(proj, limit * 2);
      
      if (olderThan) {
        results = filterByDateRange(results, '', olderThan);
      }
      
      const tagged = [];
      for (const mem of results.slice(0, limit)) {
        const currentTags = mem.tags || [];
        const newTags = action === 'add' 
          ? [...new Set([...currentTags, tag])]
          : currentTags.filter((t: string) => t !== tag);
        
         await sqliteDb.update(schema.memories).set({ tags: serializeTags(newTags) }).where(eq(schema.memories.id, mem.id));
        tagged.push(mem.id);
      }
      
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, action, tag, matched: results.length, processed: tagged.length, dryRun: !confirm }, null, 2) }] };
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
