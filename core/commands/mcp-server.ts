#!/usr/bin/env node

// CRITICAL: Redirect console.log to stderr to prevent JSON-RPC stream corruption
// MCP stdio requires stdout to contain ONLY valid JSON-RPC messages
console.log = console.error;
console.info = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { hybridSearch } from "../../core/memory/hybrid-retrieval.js";
import { rememberMemory, search as searchMemories, getMemory, getRecent, type MemoryType } from "../../core/memory/memories.js";
import { getQMDClient } from "../../core/embeddings/qmd-client.js";
import { createAssociation, getRelatedMemories, type AssociationType } from "../../core/associations.js";
import { createLearning, getLearnings } from "../../core/ingestion/learnings.js";
import { requireProject, getAllProjects } from "../../core/projects.js";
import { getMemoryStats } from "../../core/memory/stats.js";
import { logger } from "../../core/logger.js";
import { getDb } from "../../db/index.js";
import { getSchema } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../../core/security/encrypt.js";
import { startWorker, stopWorker } from "../../core/worker.js";
import { initializeScheduler } from "../../core/scheduler/cron-scheduler.js";
import { serializeTags } from "../../core/memory/serialization.js";
import { parseDate, filterByDateRange } from "../../core/lib/utils.js";

const SERVER_NAME = "squish-memory";
const SERVER_VERSION = "1.1.6";

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
      const { getTimeline } = await import('../../core/adapters/timeline.js');
      const result = await getTimeline(query, depth, limit, project);
      
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
      description: "Store any memory or learning. System auto-detects type and routes appropriately. This is THE memory write tool for agents - handles hot/cold tiers, confidence, and all memory types.",
      inputSchema: {
        content: z.string().describe("What to remember - can be a fact, decision, lesson, observation, or note"),
        project: z.string().optional().describe("Project path (auto-detected if not provided)"),
        tags: z.array(z.string()).optional().describe("Optional tags for organization"),
        tier: z.enum(["hot", "cold"]).default("hot").describe("Memory tier: hot=active/frequently accessed, cold=archived/rarely accessed"),
        type: z.enum(["observation", "fact", "decision", "context", "preference", "note"]).optional().describe("Memory type - auto-detected if not provided"),
        learningType: z.enum(["success", "failure", "fix", "insight"]).optional().describe("Learning type when routing to learning storage"),
        confidence: z.number().min(0).max(100).optional().describe("Confidence level 0-100 (default: auto-calculated)"),
        source: z.string().optional().describe("Source of memory: mcp, cli, voice, chat, document (default: mcp)"),
        route: z.enum(["auto", "memory", "learning", "note"]).default("auto").describe("Force routing: auto=detect, memory=store as memory, learning=store as learning, note=store as note"),
        pin: z.boolean().default(false).describe("Pin memory to prevent pruning/consolidation"),
        unpin: z.boolean().default(false).describe("Unpin memory")
      }
    },
    async ({ content, project, tags = [], tier = "hot", type, learningType, confidence, source, route = "auto", pin = false, unpin = false }: { 
      content: string; 
      project?: string; 
      tags?: string[]; 
      tier?: "hot" | "cold";
      type?: "observation" | "fact" | "decision" | "context" | "preference" | "note";
      learningType?: "success" | "failure" | "fix" | "insight";
      confidence?: number;
      source?: string;
      route?: "auto" | "memory" | "learning" | "note";
      pin?: boolean;
      unpin?: boolean;
    }) => {
      // Import detection function
      const { detectMemorySignals } = await import('../../core/memory/trigger-detector.js');
      const signals = detectMemorySignals(content);

      let routing: "memory" | "learning" | "note" = "memory";
      let inferredType = type || signals.suggestedType;
      let routingReason = "";

      // Check for learning patterns if auto mode
      if (route === "auto") {
        const hasLessonPattern = /(\bfailed\s+because\b|\blesson\s+learned\b|\bnext\s+time\b|\broot\s+cause\b|\bsuccess\b.*\bbecause\b|\bi\s+learned\b|\binsight\b)/i.test(content);
        const hasLearningType = /(\bsuccess\b|\bfailure\b|\bfix\b|\binsight\b)/i.test(content);
        
        // New: Enhanced learning detection from rationale patterns
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
          // TODO patterns - store as memory with task type
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
          project,
          autoLink: true 
        });
        result = { id: learning.id, type: "learning", learningType: finalLearningType, content };
      } else {
        // Store as memory with all options
        const memory = await rememberMemory({ 
          content, 
          type: inferredType as any, 
          tags, 
          project,
          tier,
          source: source || 'mcp'
        });
        
        // Handle pin/unpin after creation
        if (pin) {
          const { pinMemory } = await import('../../core/security/governance.js');
          await pinMemory(memory.id);
        } else if (unpin) {
          const { unpinMemory } = await import('../../core/security/governance.js');
          await unpinMemory(memory.id);
        }
        
        result = { id: memory.id, type: "memory", memoryType: inferredType, tier, content, pined: pin };

        // Auto-update knowledge graph (fire-and-forget)
        const { addMemoryToGraph } = await import('../../core/graph/graph-builder.js');
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
          text: `Remembered: ${result.id}\nRouting: ${routing}\nType: ${routing === "learning" ? result.learningType : result.memoryType}\nTier: ${routing === "memory" ? tier : 'N/A'}\nPriority: ${signals.priority}\nConfidence: ${signals.confidence}\nPined: ${(result as any).pinned}\nReason: ${routingReason}\n\n${content.substring(0, 100)}${content.length > 100 ? '...' : ''}` 
        }] 
      };
    }
  )) toolCount++;

  // Note: For session context, use squish_context tool (already exists)
  // It provides project memories + observations + entities

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
        return { content: [{ type: "text", text: `Memory not found: ${memoryId}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(memory, null, 2) }] };
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
          const { addMemoryToGraph } = await import('../../core/graph/graph-builder.js');
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
        return { content: [{ type: "text", text: "Error: project is required unless listProjects=true" }], isError: true };
      }

      const projectRecord = await requireProject(project);

      const recentMemories = await searchMemories({ query: "", project, limit });
      const learnings = await getLearnings(project, 5);

      const context = {
        project: projectRecord,
        recentMemories: recentMemories.slice(0, limit),
        recentLearnings: learnings
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    }
  )) toolCount++;

  // squish_learn is now deprecated - use squish_remember instead
  // The unified remember tool handles learning auto-detection

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

  // Register tool to set encryption passphrase
  if (safeRegisterTool(
    server,
    "squish_set_passphrase",
    {
      description: "Set the client-side encryption passphrase (writes to .env in data directory)",
      inputSchema: {
        passphrase: z.string().min(1).describe("Encryption passphrase to store")
      }
    },
    async ({ passphrase }: { passphrase: string }) => {
      const envPath = join(config.dataDir, ".env");
      try {
        writeFileSync(envPath, `SQUISH_ENCRYPTION_PASSPHRASE=${passphrase}\n`, { flag: "w" });
        return { content: [{ type: "text", text: `Passphrase written to ${envPath}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Failed to write passphrase: ${error}` }], isError: true };
      }
    }
  )) toolCount++;

  // Register tool to rotate encryption passphrase (re-encrypt all encrypted memories)
  if (safeRegisterTool(
    server,
    "squish_rotate_key",
    {
      description: "Rotate the encryption passphrase - re-encrypts all memories with a new passphrase",
      inputSchema: {
        oldPassphrase: z.string().min(1).describe("Current encryption passphrase"),
        newPassphrase: z.string().min(1).describe("New encryption passphrase")
      }
    },
    async ({ oldPassphrase, newPassphrase }: { oldPassphrase: string; newPassphrase: string }) => {
      try {
        const db = await getDb();
        const schema = await getSchema();
        
        // Fetch all encrypted memories
        const sqliteDb = db as any;
        const encryptedMemories = await sqliteDb
          .select()
          .from(schema.memories)
          .where(eq(schema.memories.isEncrypted, true));
        
        let rotated = 0;
        for (const mem of encryptedMemories) {
          try {
            // Decrypt with old passphrase
            const decrypted = decrypt(mem.encryptedContent!, mem.encryptionNonce!, oldPassphrase);
            // Re-encrypt with new passphrase
            const { ciphertext, nonce } = encrypt(decrypted, newPassphrase);
            
            // Update memory
            await sqliteDb
              .update(schema.memories)
              .set({ 
                encryptedContent: ciphertext, 
                encryptionNonce: nonce 
              })
              .where(eq(schema.memories.id, mem.id));
            rotated++;
          } catch (e) {
            // Skip memories that fail to decrypt (wrong passphrase)
          }
        }
        
        // Update .env file with new passphrase
        const envPath = join(config.dataDir, ".env");
        writeFileSync(envPath, `SQUISH_ENCRYPTION_PASSPHRASE=${newPassphrase}\n`, { flag: "w" });
        
        return { content: [{ type: "text", text: `Rotated encryption key for ${rotated} memories. New passphrase saved to ${envPath}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to rotate key: ${error.message}` }], isError: true };
      }
    }
  )) toolCount++;

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
  console.error(`[MCP] Starting in Streamable HTTP mode on port ${port}...`);

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
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // Streamable HTTP POST endpoint
  app.post("/mcp", async (req, res) => {
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
      
      // Create a NEW server instance for this transport
      const { server: newServer } = createSquishServer();
      serverToUse = newServer;
      
      // Create new transport with JSON response mode
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          console.error(`[MCP] Session initialized: ${newSessionId}`);
          transports.set(newSessionId, transport!);
        }
      });
      
      // Connect the NEW server to this transport
      try {
        await serverToUse.connect(transport);
      } catch (connectError: any) {
        console.error(`[MCP] Connect error (may be expected):`, connectError.message);
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
  console.error(`[MCP] Runing health check...`);
  
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
