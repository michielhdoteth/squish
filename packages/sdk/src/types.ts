/**
 * @squish/sdk - Public Type Definitions
 *
 * Re-exports core types and defines additional SDK-specific types
 * for building memory-powered applications.
 *
 * All types are defined locally in the SDK interfaces to avoid
 * tight coupling with the core package internals.
 */

// ─── Re-export Core-Mirrored Types ───────────────────────────────────────────

export type {
  MemoryType,
  ConfidenceLevel,
  MemoryRecord,
  EntityRecord,
  EntityRelation,
  GraphTraversalResult,
  RecallOptions,
  SemanticResult,
  RecallResult,
} from './interfaces/storage.js';

// ─── SDK-Specific Types ──────────────────────────────────────────────────────

import type { StorageProvider } from './interfaces/storage.js';
import type { EmbeddingProvider } from './interfaces/embeddings.js';
import type { LLMProvider } from './interfaces/llm.js';
import type { EventBus } from './interfaces/events.js';
import type { SquishConfig } from './interfaces/config.js';

export type { SquishConfig };

/**
 * Client construction options.
 * Simplified subset of SquishConfig for common use cases.
 */
export interface ClientOptions {
  /** Data directory path (default: ~/.local/share/squish) */
  dataDir?: string;
  /** Project path for scoping memories */
  project?: string;
  /** Custom storage provider (default: SQLiteStorageProvider) */
  storage?: StorageProvider;
  /** Custom embedding provider (default: null - no embeddings) */
  embeddings?: EmbeddingProvider;
  /** Custom LLM provider (default: null - no LLM) */
  llm?: LLMProvider;
  /** Custom event bus (default: DefaultEventBus) */
  events?: EventBus;
  /** Enable lifecycle decay scoring */
  lifecycleEnabled?: boolean;
  /** Enable auto-build knowledge graph */
  graphAutoBuild?: boolean;
  /** Enable memory consolidation */
  consolidationEnabled?: boolean;
}

/**
 * Unified search result combining vector, FTS, and graph sources.
 */
export interface SearchResult {
  /** The memory record */
  memory: {
    id: string;
    content: string;
    type: string;
    tags: string[];
    importance: number;
    project?: string;
    createdAt: string;
    updatedAt: string;
  };
  /** Relevance score (0-1) */
  score: number;
  /** Source that found this result */
  source: 'vector' | 'fts' | 'graph' | 'hybrid';
  /** Optional explanation of why this matched */
  explanation?: string;
}

/**
 * Plugin hook point types for extending SDK behavior.
 */
export type PluginHook =
  | 'before:store'
  | 'after:store'
  | 'before:search'
  | 'after:search'
  | 'before:delete'
  | 'after:delete'
  | 'before:consolidate'
  | 'after:consolidate'
  | 'before:graph:build'
  | 'after:graph:build';

/**
 * Context provided to plugin hooks.
 */
export interface PluginHookContext {
  /** The hook being executed */
  hook: PluginHook;
  /** The SDK config at time of hook */
  config: SquishConfig;
  /** Abort the operation (call to prevent default behavior) */
  abort: () => void;
  /** Whether the operation was aborted */
  aborted: boolean;
  /** Arbitrary metadata for the hook */
  metadata: Record<string, unknown>;
}

/**
 * Event types that can be listened to via the event bus.
 * Matches SquishEvent type discriminants.
 */
export type EventType =
  | 'memory:stored'
  | 'memory:updated'
  | 'memory:deleted'
  | 'memory:searched'
  | 'learning:stored'
  | 'graph:entity:created'
  | 'graph:relation:created'
  | 'graph:rebuilt'
  | 'decay:applied'
  | 'consolidation:started'
  | 'consolidation:completed'
  | 'session:created'
  | 'session:ended'
  | 'schema:migration:started'
  | 'schema:migration:completed'
  | 'health:check';

// ─── Re-export Event Types ───────────────────────────────────────────────────

export type { SquishEvent, EventBus, GraphBuildStats } from './interfaces/events.js';

// ─── Re-export Interface Types ───────────────────────────────────────────────

export type {
  StorageProvider,
  StorageConfig,
  StoreMemoryInput,
  MemoryFilter,
  VectorSearchFilter,
  VectorSearchResult,
  FTSResult,
  EntityInput,
  RelationInput,
  GraphNode,
  GraphEdge,
  TraversalPath,
  ProjectRecord,
  LearningInput,
  LearningRecord,
  LearningFilter,
  SchemaHealth,
} from './interfaces/storage.js';

export type {
  EmbeddingProvider,
  MultimodalInput,
  EmbeddingConfig,
} from './interfaces/embeddings.js';

export type {
  LLMProvider,
  LLMCallOptions,
  LLMContentPart,
  LLMConfig,
} from './interfaces/llm.js';

// ─── SquishClient Method Types ───────────────────────────────────────────────

import type { MemoryType } from './interfaces/storage.js';

/**
 * Options for the `remember()` method.
 */
export interface RememberOptions {
  /** Memory type (observation, fact, decision, etc.) */
  type?: MemoryType;
  /** Tags for categorization */
  tags?: string[];
  /** Importance score (0-100) */
  importance?: number;
  /** Project path to scope the memory */
  project?: string;
  /** User identifier */
  user?: string;
  /** Session identifier */
  sessionId?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for the `search()` method.
 */
export interface SearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Project path to scope the search */
  project?: string;
  /** Minimum similarity score (0-1) */
  minScore?: number;
}

/**
 * Options for the `traverseGraph()` method.
 */
export interface GraphOptions {
  /** Maximum traversal depth */
  maxDepth?: number;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Options for the `getContext()` method.
 */
export interface ContextOptions {
  /** Project path to scope the context */
  project?: string;
  /** Maximum number of memories to return */
  limit?: number;
}

/**
 * Memory statistics.
 */
export interface MemoryStats {
  /** Total number of memories */
  totalMemories: number;
  /** Breakdown by memory type */
  byType: Record<string, number>;
  /** Total number of notes/learnings */
  totalNotes: number;
  /** Notes breakdown by category */
  notesByCategory: Record<string, number>;
  /** Total number of learnings */
  totalLearnings: number;
  /** Learnings breakdown by type */
  learningsByType: Record<string, number>;
  /** Total number of links/associations */
  totalLinks: number;
  /** Oldest memory timestamp */
  oldestMemory?: string;
  /** Newest memory timestamp */
  newestMemory?: string;
  /** Project path */
  projectPath: string;
  /** Operating mode */
  mode: string;
}

/**
 * Health check result.
 */
export interface HealthResult {
  /** Overall status */
  status: string;
  /** Per-component health */
  components: Record<string, string>;
}

/**
 * Options for the `recall()` method.
 */
export interface RecallClientOptions {
  /** Maximum number of results */
  limit?: number;
  /** Project path to scope the recall */
  project?: string;
  /** Filter by memory type */
  type?: MemoryType;
  /** Filter by tags */
  tags?: string[];
  /** Strategy override (hybrid_search, entity_aware, etc.) */
  strategy?: string;
}
