/**
 * Universal Memory Types
 * Common schema for any AI agent to interface with Squish
 * Inspired by Supermemory's approach
 */

import type { MemoryType } from '../core/memory/memories.js';

// ===== Core Universal Types =====

/**
 * Container - like Supermemory's containerTag
 * Scopes memory to a project, user, client, or arbitrary group
 */
export interface Container {
  id: string;
  name: string;
  type: 'project' | 'user' | 'client' | 'agent' | 'custom';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Universal memory type - works with any agent
 */
export type UniversalMemoryType = 
  | 'observation'   // Generic observation (what happened)
  | 'action'        // Action taken by agent
  | 'reflection'    // Agent's self-reflection
  | 'insight'       // Key insight discovered
  | 'fact'          // Factual information
  | 'decision'      // Decision made
  | 'context'       // Contextual information
  | 'preference'    // User preference
  | 'learning';     // Learning from interactions

/**
 * Source agent that created this memory
 */
export interface MemorySource {
  agentType: string;        // 'claude-code' | 'hermes-agent' | 'openclaw' | 'openfang' | 'custom'
  agentId?: string;        // Specific agent instance ID
  agentVersion?: string;    // Version of the agent
  sessionId?: string;       // Session this memory belongs to
  toolName?: string;       // Tool that triggered creation (if applicable)
}

/**
 * Universal memory record - the core type all agents use
 */
export interface UniversalMemory {
  id: string;
  containerId: string;           // Which container/project this belongs to
  
  // Content
  content: string;
  type: UniversalMemoryType;
  summary?: string;               // Optional summary
  
  // Metadata
  tags: string[];
  metadata?: Record<string, unknown>;
  
  // Importance & scoring
  importance: number;             // 0-1 score
  similarity?: number;            // Search similarity score
  
  // Source tracking
  source: MemorySource;
  
  // Temporal
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;             // Optional expiration
  
  // Status
  isPinned?: boolean;
  isDeleted?: boolean;
}

// ===== API Request/Response Types =====

/**
 * Add memory request
 */
export interface AddMemoryRequest {
  content: string;
  type?: UniversalMemoryType;
  container: string;             // Container name or ID
  tags?: string[];
  metadata?: Record<string, unknown>;
  importance?: number;            // Auto-calculated if not provided
  source?: Partial<MemorySource>;
}

/**
 * Add memory response
 */
export interface AddMemoryResponse {
  id: string;
  container: string;
  type: UniversalMemoryType;
  importance: number;
  createdAt: string;
}

/**
 * Search memories request
 */
export interface SearchMemoriesRequest {
  q: string;                      // Query string
  container: string;              // Container name or ID
  type?: UniversalMemoryType | UniversalMemoryType[];
  tags?: string[];
  limit?: number;                 // Default: 10
  searchMode?: 'memories' | 'hybrid' | 'documents';
}

/**
 * Search memories response
 */
export interface SearchMemoriesResponse {
  memories: UniversalMemory[];
  profile?: UserProfile;          // User profile if requested
  total: number;
  duration: number;               // Query duration in ms
}

/**
 * Get profile request
 */
export interface GetProfileRequest {
  container: string;
  includeStatic?: boolean;         // Default: true
  includeDynamic?: boolean;       // Default: true
}

/**
 * User profile - like Supermemory's profile system
 */
export interface UserProfile {
  container: string;
  static: string[];               // Long-term stable facts
  dynamic: string[];              // Recent activity/context
  generatedAt: string;
}

// ===== Session Ingestion Types =====

/**
 * Supported session formats for ingestion
 */
export type SessionFormat = 
  | 'claude-code' 
  | 'hermes-agent' 
  | 'openclaw-jsonl' 
  | 'openfang-log'
  | 'universal-json'
  | 'auto-detect';

/**
 * Generic session data from any agent
 */
export interface SessionData {
  format: SessionFormat;
  sessionId?: string;
  agentId?: string;
  projectPath?: string;
  messages: SessionMessage[];
  metadata?: Record<string, unknown>;
}

/**
 * Single message in a session
 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
}

/**
 * Ingest session request
 */
export interface IngestSessionRequest {
  session: SessionData;
  container: string;
  options?: {
    deduplicate?: boolean;        // Default: true
    calculateImportance?: boolean; // Default: true
    extractFacts?: boolean;       // Default: true
  };
}

/**
 * Ingest session response
 */
export interface IngestSessionResponse {
  ingested: number;
  duplicated: number;
  failed: number;
  errors: string[];
  duration: number;
}

// ===== MCP Tool Types =====

/**
 * MCP tool definitions for universal MCP server
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP tools available
 */
export const MCP_TOOLS: MCPToolDefinition[] = [
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
];

// ===== HTTP API Types =====

/**
 * API Error response
 */
export interface APIError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  containers: number;
  memories: number;
}

/**
 * Container stats
 */
export interface ContainerStats {
  container: string;
  memoryCount: number;
  lastActivity: string;
  oldestMemory: string;
  newestMemory: string;
}
