#!/usr/bin/env node

/**
 * Squish v0.2.5 - Production-ready local-first persistent memory for Claude Code
 *
 * Features:
 * - 8 MCP tools (remember, recall, search, conversations, recent, observe, context, health)
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

const VERSION = '0.2.5';

const TOOLS = [
  {
    name: 'remember',
    description: 'Store a memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to store' },
        type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
        tags: { type: 'array', items: { type: 'string' } },
        project: { type: 'string', description: 'Project path' }
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
    description: 'Search memories',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
        tags: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', default: 10 },
        project: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'conversations',
    description: 'Search past conversations',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 5 },
        role: { type: 'string', enum: ['user', 'assistant'] }
      },
      required: ['query']
    }
  },
  {
    name: 'recent',
    description: 'Get recent conversations',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'number', default: 3 },
        before: { type: 'string', description: 'ISO datetime' },
        after: { type: 'string', description: 'ISO datetime' },
        project: { type: 'string' }
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
              return this.jsonResponse({ ok: true, data: await rememberMemory(args as any) });
            } catch (dbError: any) {
              if (dbError.message?.includes('Database unavailable')) {
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
              if (dbError.message?.includes('Database unavailable')) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - memory retrieval disabled');
              }
              throw dbError;
            }
          }
          case 'search': {
            if (typeof args.query !== 'string' || !args.query) {
              throw new McpError(ErrorCode.InvalidParams, 'query is required');
            }
            try {
              return this.jsonResponse({ ok: true, data: await searchMemories(args as any) });
            } catch (dbError: any) {
              if (dbError.message?.includes('Database unavailable')) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - memory search disabled');
              }
              throw dbError;
            }
          }
          case 'conversations': {
            if (typeof args.query !== 'string' || !args.query) {
              throw new McpError(ErrorCode.InvalidParams, 'query is required');
            }
            try {
              return this.jsonResponse({ ok: true, data: await searchConversations(args as any) });
            } catch (dbError: any) {
              if (dbError.message?.includes('Database unavailable')) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - conversation search disabled');
              }
              throw dbError;
            }
          }
          case 'recent':
            try {
              return this.jsonResponse({ ok: true, data: await getRecentConversations(args as any) });
            } catch (dbError: any) {
              if (dbError.message?.includes('Database unavailable')) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - conversation retrieval disabled');
              }
              throw dbError;
            }
          case 'observe': {
            if (!args.type || !args.action || !args.summary) {
              throw new McpError(ErrorCode.InvalidParams, 'type, action, and summary are required');
            }
            try {
              return this.jsonResponse({ ok: true, data: await createObservation(args as any) });
            } catch (dbError: any) {
              if (dbError.message?.includes('Database unavailable')) {
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
              if (dbError.message?.includes('Database unavailable')) {
                throw new McpError(ErrorCode.InternalError, 'Database unavailable - context retrieval disabled');
              }
              throw dbError;
            }
          }
          case 'health':
            return this.health();
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
      if (error.message?.includes('not a valid Win32 application') ||
          error.message?.includes('Database unavailable')) {
        dbStatus = 'unavailable';
      } else {
        dbStatus = 'error';
      }
    }

    const redisOk = await checkRedisHealth();

    const overallStatus = (dbStatus === 'ok' || dbStatus === 'unavailable') && redisOk ? 'ok' :
                         dbStatus === 'unavailable' ? 'degraded' : 'error';

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
