/**
 * Universal MCP Server
 * 
 * MCP server that works with any AI agent (not just Claude Code).
 * Based on the existing MCP infrastructure in index.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../core/logger.js';
import { rememberMemory, searchMemories, getMemoryById } from '../../core/memory/memories.js';
import { ensureProject } from '../../core/projects.js';
import { getCoreMemory, initializeCoreMemory } from '../../core/core-memory.js';
import type { UniversalMemoryType } from './types.js';

// Universal MCP tools - same as Supermemory's approach
const UNIVERSAL_TOOLS = [
  {
    name: 'memory',
    description: 'Save or forget information. Your AI calls this automatically when you share something worth remembering.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content to remember' },
        container: { type: 'string', description: 'Container/project name (default: default)' },
        type: { type: 'string', enum: ['observation', 'action', 'reflection', 'insight', 'fact', 'decision', 'context', 'preference', 'learning'], description: 'Type of memory' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
        forget: { type: 'boolean', description: 'If true, forget this memory instead of saving' },
        metadata: { type: 'object', description: 'Additional metadata' },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall',
    description: 'Search memories by query. Returns relevant memories + user profile summary.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
        container: { type: 'string', description: 'Container/project name (default: default)' },
        type: { type: 'string', description: 'Filter by memory type' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['q'],
    },
  },
  {
    name: 'context',
    description: 'Injects full profile (preferences, recent activity) into the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container/project name (default: default)' },
      },
    },
  },
  {
    name: 'health',
    description: 'Check Squish service status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Create the universal MCP server
 */
export function createUniversalMCPServer() {
  const server = new Server(
    {
      name: 'squish-universal',
      version: '0.9.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: UNIVERSAL_TOOLS,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'memory': {
          if (args.forget) {
            // TODO: Implement forget functionality
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, message: 'Forget not yet implemented' }),
                },
              ],
            };
          }

          const container = args.container || 'default';
          await ensureProject(container);

          const memory = await rememberMemory({
            content: args.content,
            type: args.type as UniversalMemoryType || 'observation',
            project: container,
            tags: args.tags,
            metadata: args.metadata,
            source: 'universal-mcp',
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  id: memory.id,
                  container,
                  type: memory.type,
                  importance: memory.importance,
                }),
              },
            ],
          };
        }

        case 'recall': {
          const container = args.container || 'default';
          const results = await searchMemories({
            query: args.q,
            project: container,
            type: args.type as any,
            limit: args.limit || 10,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  memories: results.map(m => ({
                    id: m.id,
                    content: m.content,
                    type: m.type,
                    tags: m.tags,
                    similarity: m.similarity,
                  })),
                  total: results.length,
                }),
              },
            ],
          };
        }

        case 'context': {
          const container = args.container || 'default';
          await ensureProject(container);
          await initializeCoreMemory(container);
          
          const coreMemory = await getCoreMemory(container);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  container,
                  coreMemory,
                  generatedAt: new Date().toISOString(),
                }),
              },
            ],
          };
        }

        case 'health': {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'healthy',
                  version: '0.9.0',
                  uptime: process.uptime(),
                }),
              },
            ],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    } catch (error) {
      logger.error(`MCP tool error (${name}):`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the universal MCP server
 */
export async function startUniversalMCPServer() {
  const server = createUniversalMCPServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  logger.info('Universal MCP server started');
  
  return server;
}
