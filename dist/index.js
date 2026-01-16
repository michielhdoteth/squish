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
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { checkDatabaseHealth, config } from './db/index.js';
import { checkRedisHealth, closeCache } from './core/cache.js';
import { rememberMemory, getMemoryById, searchMemories } from './features/memory/memories.js';
import { searchConversations, getRecentConversations } from './features/search/conversations.js';
import { createObservation } from './core/observations.js';
import { getProjectContext } from './core/context.js';
import { startWebServer } from './features/web/web.js';
// Merge functionality disabled for stable release
// import { handleDetectDuplicates } from './features/merge/handlers/detect-duplicates.js';
// import { handleListProposals } from './features/merge/handlers/list-proposals.js';
// import { handlePreviewMerge } from './features/merge/handlers/preview-merge.js';
// import { handleApproveMerge } from './features/merge/handlers/approve-merge.js';
// import { handleRejectMerge } from './features/merge/handlers/reject-merge.js';
// import { handleReverseMerge } from './features/merge/handlers/reverse-merge.js';
// import { handleGetMergeStats } from './features/merge/handlers/get-stats.js';
import { forceLifecycleMaintenance } from './core/worker.js';
import { summarizeSession } from './core/summarization.js';
import { storeAgentMemory } from './core/agent-memory.js';
import { getRelatedMemories } from './core/associations.js';
import { protectMemory, pinMemory } from './core/governance.js';
import { isDatabaseUnavailableError, determineOverallStatus } from './core/utils.js';
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
    },
    // Merge functionality disabled for stable release
    // {
    //   name: 'detect_duplicate_memories',
    //   description: 'Scan for duplicate or similar memories and create merge proposals',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       projectId: { type: 'string', description: 'Project ID to scan' },
    //       threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.85)' },
    //       memoryType: { type: 'string', enum: ['fact', 'preference', 'decision', 'observation', 'context'] },
    //       limit: { type: 'number', description: 'Max proposals to generate (default: 50)' },
    //       autoCreateProposals: { type: 'boolean', description: 'Create merge proposals automatically (default: true)' }
    //     },
    //     required: ['projectId']
    //   }
    // },
    // {
    //   name: 'list_merge_proposals',
    //   description: 'List pending merge proposals for review',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       projectId: { type: 'string', description: 'Project ID' },
    //       status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'expired'] },
    //       limit: { type: 'number', description: 'Max proposals to return (default: 20)' }
    //     },
    //     required: ['projectId']
    //   }
    // },
    // {
    //   name: 'preview_merge',
    //   description: 'Preview the result of a merge proposal without applying it',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       proposalId: { type: 'string', description: 'Merge proposal ID' }
    //     },
    //     required: ['proposalId']
    //   }
    // },
    // {
    //   name: 'approve_merge',
    //   description: 'Approve and execute a merge proposal',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       proposalId: { type: 'string', description: 'Merge proposal ID to approve' },
    //       reviewNotes: { type: 'string', description: 'Optional notes about the approval' }
    //     },
    //     required: ['proposalId']
    //   }
    // },
    // {
    //   name: 'reject_merge',
    //   description: 'Reject a merge proposal',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       proposalId: { type: 'string', description: 'Merge proposal ID to reject' },
    //       reviewNotes: { type: 'string', description: 'Reason for rejection' }
    //     },
    //     required: ['proposalId']
    //   }
    // },
    // {
    //   name: 'reverse_merge',
    //   description: 'Reverse a completed merge and restore original memories',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       mergeHistoryId: { type: 'string', description: 'Merge history ID to reverse' },
    //       reason: { type: 'string', description: 'Reason for reversal' }
    //     },
    //     required: ['mergeHistoryId']
    //   }
    // },
    // {
    //   name: 'get_merge_stats',
    //   description: 'Get statistics about memory merges (tokens saved, merge count, etc.)',
    //   inputSchema: {
    //     type: 'object',
    //     properties: {
    //       projectId: { type: 'string', description: 'Project ID' }
    //     },
    //     required: ['projectId']
    //   }
    // },
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
        name: 'agent_remember',
        description: 'Store memory with agent context and visibility scope',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'Memory content' },
                agentId: { type: 'string', description: 'Agent identifier' },
                agentRole: { type: 'string', description: 'Agent role' },
                visibilityScope: { type: 'string', enum: ['private', 'project', 'team', 'global'] },
                sector: { type: 'string', enum: ['episodic', 'semantic', 'procedural', 'autobiographical', 'working'] },
                tags: { type: 'array', items: { type: 'string' } }
            },
            required: ['content', 'agentId']
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
];
class Squish {
    server;
    constructor() {
        this.server = new Server({ name: 'squish', version: VERSION }, { capabilities: { tools: {} } });
        this.setup();
    }
    setup() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: TOOLS
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
            const { name } = req.params;
            const args = (req.params.arguments ?? {});
            try {
                switch (name) {
                    case 'remember': {
                        if (typeof args.content !== 'string' || !args.content) {
                            throw new McpError(ErrorCode.InvalidParams, 'content is required');
                        }
                        try {
                            return this.jsonResponse({ ok: true, data: await rememberMemory(args) });
                        }
                        catch (dbError) {
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
                        }
                        catch (dbError) {
                            if (isDatabaseUnavailableError(dbError)) {
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
                            return this.jsonResponse({ ok: true, data: await searchMemories(args) });
                        }
                        catch (dbError) {
                            if (isDatabaseUnavailableError(dbError)) {
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
                            return this.jsonResponse({ ok: true, data: await searchConversations(args) });
                        }
                        catch (dbError) {
                            if (isDatabaseUnavailableError(dbError)) {
                                throw new McpError(ErrorCode.InternalError, 'Database unavailable - conversation search disabled');
                            }
                            throw dbError;
                        }
                    }
                    case 'recent':
                        try {
                            return this.jsonResponse({ ok: true, data: await getRecentConversations(args) });
                        }
                        catch (dbError) {
                            if (isDatabaseUnavailableError(dbError)) {
                                throw new McpError(ErrorCode.InternalError, 'Database unavailable - conversation retrieval disabled');
                            }
                            throw dbError;
                        }
                    case 'observe': {
                        if (!args.type || !args.action || !args.summary) {
                            throw new McpError(ErrorCode.InvalidParams, 'type, action, and summary are required');
                        }
                        try {
                            return this.jsonResponse({ ok: true, data: await createObservation(args) });
                        }
                        catch (dbError) {
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
                            return this.jsonResponse({ ok: true, data: await getProjectContext(args) });
                        }
                        catch (dbError) {
                            if (isDatabaseUnavailableError(dbError)) {
                                throw new McpError(ErrorCode.InternalError, 'Database unavailable - context retrieval disabled');
                            }
                            throw dbError;
                        }
                    }
                    case 'health':
                        return this.health();
                    // Merge functionality disabled for stable release
                    // case 'detect_duplicate_memories':
                    //   return this.jsonResponse(await handleDetectDuplicates(args as any));
                    // case 'list_merge_proposals':
                    //   return this.jsonResponse(await handleListProposals(args as any));
                    // case 'preview_merge':
                    //   return this.jsonResponse(await handlePreviewMerge(args as any));
                    // case 'approve_merge':
                    //   return this.jsonResponse(await handleApproveMerge(args as any));
                    // case 'reject_merge':
                    //   return this.jsonResponse(await handleRejectMerge(args as any));
                    // case 'reverse_merge':
                    //   return this.jsonResponse(await handleReverseMerge(args as any));
                    // case 'get_merge_stats':
                    //   return this.jsonResponse(await handleGetMergeStats(args as any));
                    case 'lifecycle': {
                        const { project } = args;
                        const result = await forceLifecycleMaintenance(project);
                        return this.jsonResponse({
                            success: true,
                            message: 'Lifecycle maintenance completed',
                            stats: result,
                        });
                    }
                    case 'summarize_session': {
                        const { conversationId, type } = args;
                        if (!conversationId || !type) {
                            throw new McpError(ErrorCode.InvalidParams, 'conversationId and type are required');
                        }
                        const result = await summarizeSession(conversationId, type);
                        return this.jsonResponse({
                            success: true,
                            summaryId: result.summaryId,
                            tokensSaved: result.tokensSaved,
                            message: `Session summarized with type: ${type}`,
                        });
                    }
                    case 'agent_remember': {
                        const { content, agentId, agentRole, visibilityScope, sector, } = args;
                        if (!content || !agentId) {
                            throw new McpError(ErrorCode.InvalidParams, 'content and agentId are required');
                        }
                        const memoryId = await storeAgentMemory(content, {
                            agentId,
                            agentRole,
                        }, {
                            visibilityScope,
                            sector,
                        });
                        return this.jsonResponse({
                            success: true,
                            memoryId,
                            message: 'Memory stored with agent context',
                        });
                    }
                    case 'protect_memory': {
                        const { memoryId, reason } = args;
                        if (!memoryId || !reason) {
                            throw new McpError(ErrorCode.InvalidParams, 'memoryId and reason are required');
                        }
                        await protectMemory(memoryId, reason);
                        return this.jsonResponse({
                            success: true,
                            memoryId,
                            message: 'Memory protected from eviction',
                        });
                    }
                    case 'pin_memory': {
                        const { memoryId } = args;
                        if (!memoryId) {
                            throw new McpError(ErrorCode.InvalidParams, 'memoryId is required');
                        }
                        await pinMemory(memoryId);
                        return this.jsonResponse({
                            success: true,
                            memoryId,
                            message: 'Memory pinned for auto-injection',
                        });
                    }
                    case 'get_related': {
                        const { memoryId, limit } = args;
                        if (!memoryId) {
                            throw new McpError(ErrorCode.InvalidParams, 'memoryId is required');
                        }
                        const related = await getRelatedMemories(memoryId, limit || 10);
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
            }
            catch (error) {
                if (error instanceof McpError)
                    throw error;
                console.error('[squish] Tool error:', error);
                throw new McpError(ErrorCode.InternalError, `Tool '${name}' failed`);
            }
        });
        this.server.onerror = (e) => console.error('[squish]', e);
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }
    jsonResponse(payload) {
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify(payload, null, 2)
                }]
        };
    }
    async shutdown() {
        await closeCache();
        process.exit(0);
    }
    async health() {
        let dbOk = false;
        let dbStatus = 'ok';
        try {
            dbOk = await checkDatabaseHealth();
            dbStatus = dbOk ? 'ok' : 'unavailable';
        }
        catch (error) {
            if (isDatabaseUnavailableError(error)) {
                dbStatus = 'unavailable';
            }
            else {
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
//# sourceMappingURL=index.js.map