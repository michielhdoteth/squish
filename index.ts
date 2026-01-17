#!/usr/bin/env node

/**
 * Squish v0.4.0 - Production-ready local-first persistent memory for Claude Code
 *
 * Features:
 * - 14 MCP tools (consolidated from 23 for usability)
 * - Local mode: SQLite with FTS5 + auto-capture + folder context
 * - Team mode: PostgreSQL + pgvector + Redis
 * - Plugin system: Hooks for auto-capture, context injection, privacy filtering, folder context generation
 * - Privacy-first: Secret detection, <private> tag filtering, async worker pipeline
 * - Pluggable embeddings: OpenAI, Ollama, or local TF-IDF
 *
 * Plugin hooks (registered in plugin.json):
 * - onInstall: Initialize database, create config files
 * - onSessionStart: Inject relevant context + generate folder context
 * - onUserPromptSubmit: Auto-capture user prompts with privacy filtering
 * - onPostToolUse: Auto-capture tool executions and observe patterns
 * - onSessionStop: Finalize observations, summarize via async worker
 *
 * See src/plugin/plugin-wrapper.ts for hook implementations
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { checkDatabaseHealth, config } from './db/index.js';
import { checkRedisHealth, closeCache } from './core/cache.js';
import { rememberMemory, getMemoryById, searchMemories } from './features/memory/memories.js';
import { searchConversations, getRecentConversations } from './features/search/conversations.js';
import { createObservation } from './core/observations.js';
import { getProjectContext } from './core/context.js';
import { startWebServer } from './features/web/web.js';
import { handleDetectDuplicates } from './features/merge/handlers/detect-duplicates.js';
import { handleListProposals } from './features/merge/handlers/list-proposals.js';
import { handlePreviewMerge } from './features/merge/handlers/preview-merge.js';
import { handleApproveMerge } from './features/merge/handlers/approve-merge.js';
import { handleRejectMerge } from './features/merge/handlers/reject-merge.js';
import { handleReverseMerge } from './features/merge/handlers/reverse-merge.js';
import { handleGetMergeStats } from './features/merge/handlers/get-stats.js';
import { forceLifecycleMaintenance } from './core/worker.js';
import { summarizeSession } from './core/summarization.js';
import { storeAgentMemory } from './core/agent-memory.js';
import { getRelatedMemories } from './core/associations.js';
import { protectMemory, pinMemory } from './core/governance.js';
import { isDatabaseUnavailableError, determineOverallStatus } from './core/utils.js';

const VERSION = '0.4.0';

const TOOLS = [
  {
    name: 'remember',
    description: 'Store a memory (with optional agent context)',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to store' },
        type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
        tags: { type: 'array', items: { type: 'string' } },
        project: { type: 'string', description: 'Project path' },
        metadata: { type: 'object', description: 'Custom metadata' },
        agentId: { type: 'string', description: 'Agent identifier (optional)' },
        agentRole: { type: 'string', description: 'Agent role (optional)' },
        visibilityScope: { type: 'string', enum: ['private', 'project', 'team', 'global'], description: 'Visibility scope for agent memories' },
        sector: { type: 'string', enum: ['episodic', 'semantic', 'procedural', 'autobiographical', 'working'], description: 'Memory sector classification' }
      },
      required: ['content']
    }
  },
  {
    name: 'recall',
    description: 'Get memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory UUID' }
      },
      required: ['id']
    }
  },
  {
    name: 'search',
    description: 'Search memories, conversations, or get recent items',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (not required for scope=recent)' },
        scope: {
          type: 'string',
          enum: ['memories', 'conversations', 'recent'],
          default: 'memories',
          description: 'Search scope: memories, conversations, or recent items'
        },
        type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
        tags: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', default: 10 },
        project: { type: 'string' },
        role: { type: 'string', enum: ['user', 'assistant'], description: 'Filter by role (conversations scope)' },
        n: { type: 'number', description: 'Number of recent items (recent scope)' },
        before: { type: 'string', description: 'ISO datetime for recent scope' },
        after: { type: 'string', description: 'ISO datetime for recent scope' }
      }
    }
  },
  {
    name: 'observe',
    description: 'Store an observation',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tool_use', 'file_change', 'error', 'pattern', 'insight'] },
        action: { type: 'string', description: 'Action taken' },
        target: { type: 'string', description: 'Target of action' },
        summary: { type: 'string', description: 'Summary' },
        details: { type: 'object' },
        session: { type: 'string', description: 'Session ID' }
      },
      required: ['type', 'action', 'summary']
    }
  },
  {
    name: 'context',
    description: 'Get project context',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project path' },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['memories', 'observations', 'entities', 'messages'] },
          default: ['memories', 'observations']
        },
        limit: { type: 'number', default: 10 }
      },
      required: ['project']
    }
  },
  {
    name: 'health',
    description: 'Check service status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'merge',
    description: 'Manage memory merge proposals: detect, list, preview, or get statistics',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['detect', 'list', 'preview', 'stats'],
          description: 'Operation mode'
        },
        projectId: { type: 'string', description: 'Project ID' },
        proposalId: { type: 'string', description: 'Proposal ID (required for preview mode)' },
        threshold: { type: 'number', description: 'Similarity threshold 0-1 (detect mode)' },
        memoryType: { type: 'string', enum: ['fact', 'preference', 'decision', 'observation', 'context'], description: 'Memory type filter (detect mode)' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'expired'], description: 'Proposal status filter (list mode)' },
        limit: { type: 'number', description: 'Max results to return' }
      },
      required: ['mode', 'projectId']
    }
  },
  {
    name: 'merge_decide',
    description: 'Approve, reject, or reverse memory merge proposals',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['approve', 'reject', 'reverse'],
          description: 'Decision action'
        },
        proposalId: { type: 'string', description: 'Proposal ID (for approve/reject)' },
        mergeHistoryId: { type: 'string', description: 'Merge history ID (for reverse)' },
        reviewNotes: { type: 'string', description: 'Notes or reason for decision' }
      },
      required: ['action']
    }
  },
  {
    name: 'lifecycle',
    description: 'Run memory lifecycle maintenance (decay, eviction, tier updates)',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project path (optional)' },
        force: { type: 'boolean', description: 'Force immediate execution' }
      }
    }
  },
  {
    name: 'summarize_session',
    description: 'Summarize a conversation session',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation UUID' },
        type: { type: 'string', enum: ['incremental', 'rolling', 'final'], description: 'Summary type' }
      },
      required: ['conversationId', 'type']
    }
  },
  {
    name: 'protect_memory',
    description: 'Mark memory as protected (cannot be evicted)',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'Memory UUID' },
        reason: { type: 'string', description: 'Protection reason' }
      },
      required: ['memoryId', 'reason']
    }
  },
  {
    name: 'pin_memory',
    description: 'Pin memory for automatic injection into context',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'Memory UUID' }
      },
      required: ['memoryId']
    }
  },
  {
    name: 'get_related',
    description: 'Get related memories via association graph',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'Memory UUID' },
        limit: { type: 'number', description: 'Max results (default: 10)' }
      },
      required: ['memoryId']
    }
  }
] as const;

class Squish {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'squish', version: VERSION },
      { capabilities: { tools: {} } }
    );
    this.setup();
  }

  private setup() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS as unknown as typeof TOOLS
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name } = req.params;
      const args = (req.params.arguments ?? {}) as Record<string, unknown>;

      try {
        switch (name) {
          case 'remember': {
            if (typeof args.content !== 'string' || !args.content) {
              throw new McpError(ErrorCode.InvalidParams, 'content is required');
            }
            try {
              // Check if agent context is provided
              if (args.agentId) {
                const memoryId = await storeAgentMemory(args.content, {
                  agentId: args.agentId,
                  agentRole: args.agentRole as string | undefined,
                } as any, {
                  type: args.type as string | undefined,
                  visibilityScope: args.visibilityScope as any,
                  sector: args.sector as any,
                  tags: args.tags as string[] | undefined,
                  metadata: args.metadata as any,
                });
                return this.jsonResponse({ ok: true, memoryId, agentContext: true });
              } else {
                // Standard memory storage
                return this.jsonResponse({ ok: true, data: await rememberMemory(args as any) });
              }
            } catch (dbError: any) {
              if (isDatabaseUnavailableError(dbError)) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - memory storage disabled');
              }
              throw dbError;
            }
          }
          case 'recall': {
            if (!args.id) {
              throw new McpError(ErrorCode.InvalidParams, 'id is required');
            }
            try {
              const memory = await getMemoryById(String(args.id));
              return this.jsonResponse({ ok: true, found: !!memory, data: memory });
            } catch (dbError: any) {
              if (isDatabaseUnavailableError(dbError)) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - memory retrieval disabled');
              }
              throw dbError;
            }
          }
          case 'search': {
            const scope = (args.scope as string) || 'memories';
            try {
              if (scope === 'memories') {
                if (typeof args.query !== 'string' || !args.query) {
                  throw new McpError(ErrorCode.InvalidParams, 'query is required for memory search');
                }
                return this.jsonResponse({ ok: true, scope: 'memories', data: await searchMemories(args as any) });
              } else if (scope === 'conversations') {
                if (typeof args.query !== 'string' || !args.query) {
                  throw new McpError(ErrorCode.InvalidParams, 'query is required for conversation search');
                }
                return this.jsonResponse({ ok: true, scope: 'conversations', data: await searchConversations(args as any) });
              } else if (scope === 'recent') {
                return this.jsonResponse({ ok: true, scope: 'recent', data: await getRecentConversations(args as any) });
              } else {
                throw new McpError(ErrorCode.InvalidParams, `Unknown scope: ${scope}`);
              }
            } catch (dbError: any) {
              if (isDatabaseUnavailableError(dbError)) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - search disabled');
              }
              throw dbError;
            }
          }
          case 'observe': {
            if (!args.type || !args.action || !args.summary) {
              throw new McpError(ErrorCode.InvalidParams, 'type, action, and summary are required');
            }
            try {
              return this.jsonResponse({ ok: true, data: await createObservation(args as any) });
            } catch (dbError: any) {
              if (isDatabaseUnavailableError(dbError)) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - observation storage disabled');
              }
              throw dbError;
            }
          }
          case 'context': {
            if (!args.project) {
              throw new McpError(ErrorCode.InvalidParams, 'project is required');
            }
            try {
              return this.jsonResponse({ ok: true, data: await getProjectContext(args as any) });
            } catch (dbError: any) {
              if (isDatabaseUnavailableError(dbError)) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - context retrieval disabled');
              }
              throw dbError;
            }
          }
          case 'health':
            return this.health();
          case 'merge': {
            const { mode } = args as { mode: string };
            switch (mode) {
              case 'detect':
                return this.jsonResponse(await handleDetectDuplicates(args as any));
              case 'list':
                return this.jsonResponse(await handleListProposals(args as any));
              case 'preview':
                return this.jsonResponse(await handlePreviewMerge(args as any));
              case 'stats':
                return this.jsonResponse(await handleGetMergeStats(args as any));
              default:
                throw new McpError(ErrorCode.InvalidParams, `Unknown merge mode: ${mode}`);
            }
          }
          case 'merge_decide': {
            const { action } = args as { action: string };
            switch (action) {
              case 'approve':
                return this.jsonResponse(await handleApproveMerge(args as any));
              case 'reject':
                return this.jsonResponse(await handleRejectMerge(args as any));
              case 'reverse':
                return this.jsonResponse(await handleReverseMerge(args as any));
              default:
                throw new McpError(ErrorCode.InvalidParams, `Unknown action: ${action}`);
            }
          }
          case 'lifecycle': {
            const { project } = args as { project?: string };
            const result = await forceLifecycleMaintenance(project);
            return this.jsonResponse({
              success: true,
              message: 'Lifecycle maintenance completed',
              stats: result,
            });
          }
          case 'summarize_session': {
            const { conversationId, type } = args as {
              conversationId: string;
              type: 'incremental' | 'rolling' | 'final';
            };
            if (!conversationId || !type) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'conversationId and type are required'
              );
            }
            const result = await summarizeSession(conversationId, type);
            return this.jsonResponse({
              success: true,
              summaryId: result.summaryId,
              tokensSaved: result.tokensSaved,
              message: `Session summarized with type: ${type}`,
            });
          }
          case 'protect_memory': {
            const { memoryId, reason } = args as {
              memoryId: string;
              reason: string;
            };
            if (!memoryId || !reason) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'memoryId and reason are required'
              );
            }
            await protectMemory(memoryId, reason);
            return this.jsonResponse({
              success: true,
              memoryId,
              message: 'Memory protected from eviction',
            });
          }
          case 'pin_memory': {
            const { memoryId } = args as { memoryId: string };
            if (!memoryId) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'memoryId is required'
              );
            }
            await pinMemory(memoryId);
            return this.jsonResponse({
              success: true,
              memoryId,
              message: 'Memory pinned for auto-injection',
            });
          }
          case 'get_related': {
            const { memoryId, limit } = args as {
              memoryId: string;
              limit?: number;
            };
            if (!memoryId) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'memoryId is required'
              );
            }
            const related = await getRelatedMemories(
              memoryId,
              limit || 10
            );
            return this.jsonResponse({
              success: true,
              memoryId,
              relatedCount: related.length,
              memories: related,
            });
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        console.error('[squish] Tool error:', error);
        throw new McpError(ErrorCode.InternalError, `Tool '${name}' failed`);
      }
    });

    this.server.onerror = (e) => console.error('[squish]', e);
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private jsonResponse(payload: unknown) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }]
    };
  }

  private async shutdown() {
    await closeCache();
    process.exit(0);
  }

  private async health() {
    let dbOk = false;
    let dbStatus: 'ok' | 'unavailable' | 'error' = 'ok';

    try {
      dbOk = await checkDatabaseHealth();
      dbStatus = dbOk ? 'ok' : 'unavailable';
    } catch (error: any) {
      if (isDatabaseUnavailableError(error)) {
        dbStatus = 'unavailable';
      } else {
        dbStatus = 'error';
      }
    }

    const redisOk = await checkRedisHealth();
    const overallStatus = determineOverallStatus(dbStatus, redisOk);

    return this.jsonResponse({
      version: VERSION,
      mode: config.isTeamMode ? 'team' : 'local',
      database: config.isTeamMode ? 'postgresql' : 'sqlite',
      cache: config.redisEnabled ? 'redis' : 'memory',
      embeddingsProvider: config.embeddingsProvider,
      status: overallStatus,
      checks: {
        database: dbStatus,
        cache: redisOk ? 'ok' : 'error'
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[squish] v${VERSION}`);

    // Start web UI server in background
    startWebServer();
  }
}

new Squish().run().catch((e) => {
  console.error('[squish] Fatal:', e);
  process.exit(1);
});
