import { MCPToolDefinition, MCPToolResult } from './types.js';
import { hybridSearch } from '../memory/hybrid-retrieval.js';
import { rememberMemory, search, getMemory } from '../memory/memories.js';
import { getEmbedding, getBatchEmbeddings } from '../embeddings.js';
import { getQMDClient } from '../embeddings/qmd-client.js';
import { logger } from '../logger.js';

function textResult(text: string): MCPToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

function errorResult(error: string): MCPToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${error}` }],
    isError: true,
  };
}

export const squishSearchTool: MCPToolDefinition = {
  tool: {
    name: 'squish_search',
    description: 'Search Squish memory using hybrid scoring (semantic + recency + importance)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 5)',
        },
        project: {
          type: 'string',
          description: 'Project path filter',
        },
      },
      required: ['query'],
    },
  },
  handler: async (args) => {
    try {
      const { query, limit = 5, project } = args;

      if (!query) {
        return errorResult('Query is required');
      }

      const results = await hybridSearch({
        query,
        limit,
        project,
        candidateLimit: 50,
        resultLimit: limit,
      });

      const formatted = results.map((r, i) => 
        `${i + 1}. [${r.type || 'memory'}] ${r.content?.substring(0, 200)}... (score: ${r.hybridScore?.toFixed(2)})`
      ).join('\n');

      return textResult(`Found ${results.length} memories:\n\n${formatted}`);
    } catch (error) {
      logger.error('Search error:', error);
      return errorResult(error instanceof Error ? error.message : 'Search failed');
    }
  },
};

export const squishRememberTool: MCPToolDefinition = {
  tool: {
    name: 'squish_remember',
    description: 'Store a new memory in Squish',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Memory content to store',
        },
        type: {
          type: 'string',
          description: 'Memory type (observation, fact, decision, context, preference)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags',
        },
        project: {
          type: 'string',
          description: 'Project path',
        },
        // Rich context fields (Agent 4 feedback)
        source: {
          type: 'string',
          description: 'Source of this memory (e.g., "voice", "chat", "document")',
        },
        reasoning: {
          type: 'string',
          description: 'Why this memory is important',
        },
        context: {
          type: 'string',
          description: 'What triggered this memory',
        },
        examples: {
          type: 'string',
          description: 'When to apply this knowledge',
        },
        exceptions: {
          type: 'string',
          description: 'When NOT to apply this',
        },
        tier: {
          type: 'string',
          description: 'Memory tier: hot (active) or cold (archived)',
          enum: ['hot', 'cold'],
        },
      },
      required: ['content'],
    },
  },
  handler: async (args) => {
    try {
      const { content, type = 'observation', tags = [], project, source, reasoning, context, examples, exceptions, tier = 'hot' } = args;

      if (!content) {
        return errorResult('Content is required');
      }

      const memory = await rememberMemory({
        content,
        type,
        tags,
        project,
        source,
        reasoning,
        memoryContext: context,
        examples,
        exceptions,
        tier,
      });

      return textResult(`Memory stored: ${memory.id}`);
    } catch (error) {
      logger.error('Remember error:', error);
      return errorResult(error instanceof Error ? error.message : 'Failed to store memory');
    }
  },
};

export const squishRecallTool: MCPToolDefinition = {
  tool: {
    name: 'squish_recall',
    description: 'Retrieve a specific memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'Memory ID to retrieve',
        },
      },
      required: ['memoryId'],
    },
  },
  handler: async (args) => {
    try {
      const { memoryId } = args;

      if (!memoryId) {
        return errorResult('Memory ID is required');
      }

      const memory = await getMemory(memoryId);

      if (!memory) {
        return errorResult('Memory not found');
      }

      return textResult(JSON.stringify(memory, null, 2));
    } catch (error) {
      logger.error('Recall error:', error);
      return errorResult(error instanceof Error ? error.message : 'Failed to retrieve memory');
    }
  },
};

export const squishEmbedTool: MCPToolDefinition = {
  tool: {
    name: 'squish_embed',
    description: 'Generate embeddings for text using configured provider (supports multimodal)',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to embed',
        },
      },
      required: ['text'],
    },
  },
  handler: async (args) => {
    try {
      const { text } = args;

      if (!text) {
        return errorResult('Text is required');
      }

      const embedding = await getEmbedding(text);

      if (!embedding) {
        return errorResult('Failed to generate embedding');
      }

      return textResult(JSON.stringify({
        dimensions: embedding.length,
        preview: embedding.slice(0, 5),
      }, null, 2));
    } catch (error) {
      logger.error('Embed error:', error);
      return errorResult(error instanceof Error ? error.message : 'Failed to generate embedding');
    }
  },
};

export const squishQMDSearchTool: MCPToolDefinition = {
  tool: {
    name: 'squish_qmd_search',
    description: 'Search markdown files using QMD (local, fast BM25 + vector)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        collection: {
          type: 'string',
          description: 'QMD collection name (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  handler: async (args) => {
    try {
      const { query, collection, limit = 10 } = args;

      if (!query) {
        return errorResult('Query is required');
      }

      const client = await getQMDClient();
      const available = await client.isAvailable();

      if (!available) {
        return errorResult('QMD not available');
      }

      const results = await client.search({ 
        query, 
        collection, 
        limit: limit || 10 
      });

      const formatted = results.map((r: any, i: number) =>
        `${i + 1}. ${r.path || r.file} (score: ${r.score?.toFixed(2)})\n   ${r.content?.substring(0, 150)}...`
      ).join('\n\n');

      return textResult(`QMD found ${results.length} results:\n\n${formatted}`);
    } catch (error) {
      logger.error('QMD search error:', error);
      return errorResult(error instanceof Error ? error.message : 'QMD search failed');
    }
  },
};

export const squishHealthTool: MCPToolDefinition = {
  tool: {
    name: 'squish_health',
    description: 'Check Squish health status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async (args) => {
    try {
      const qmdClient = await getQMDClient();
      const qmdAvailable = await qmdClient.isAvailable();

      return textResult(JSON.stringify({
        status: 'ok',
        version: '0.9.0',
        qmd: qmdAvailable ? 'available' : 'unavailable',
        timestamp: new Date().toISOString(),
      }, null, 2));
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'Health check failed');
    }
  },
};

const squishGetSearchTracesTool: MCPToolDefinition = {
  tool: {
    name: 'squish_get_search_traces',
    description: 'Get recent search traces for debugging and performance analysis',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum traces to return (default: 10)',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID filter',
        },
      },
      required: [],
    },
  },
  handler: async (args) => {
    try {
      const { limit = 10, sessionId } = args;
      const collectorModule = await import('../tracing/collector.js');
      const { getTraces } = collectorModule;

      const traces = await getTraces({ limit, sessionId });

      const formatted = traces.map((t, i) =>
        `${i + 1}. [${t.id.substring(0, 8)}] Query: "${t.query.substring(0, 50)}" Duration: ${t.totalDurationMs}ms`
      ).join('\n');

      return textResult(`Found ${traces.length} traces:\n\n${formatted}`);
    } catch (error) {
      logger.error('Get search traces error:', error);
      return errorResult(error instanceof Error ? error.message : 'Get traces failed');
    }
  },
};

const squishGetTraceByIdTool: MCPToolDefinition = {
  tool: {
    name: 'squish_get_trace_by_id',
    description: 'Get a specific search trace by ID with full stage details',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: 'Trace ID to retrieve',
        },
      },
      required: ['traceId'],
    },
  },
  handler: async (args) => {
    try {
      const { traceId } = args;
      const collectorModule = await import('../tracing/collector.js');
      const { getTraceById } = collectorModule;
      const visualizerModule = await import('../tracing/visualizer.js');
      const { visualizeTrace } = visualizerModule;

      const trace = await getTraceById(traceId);

      if (!trace) {
        return errorResult('Trace not found');
      }

      const visualization = visualizeTrace(trace);

      return textResult(`\n${visualization}\n`);
    } catch (error) {
      logger.error('Get trace by ID error:', error);
      return errorResult(error instanceof Error ? error.message : 'Get trace by ID failed');
    }
  },
};

export function getAllSquishTools(): MCPToolDefinition[] {
  return [
    squishSearchTool,
    squishRememberTool,
    squishRecallTool,
    squishEmbedTool,
    squishQMDSearchTool,
    squishHealthTool,
    squishGetSearchTracesTool,
    squishGetTraceByIdTool,
  ];
}
