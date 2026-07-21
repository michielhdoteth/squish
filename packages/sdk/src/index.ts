/**
 * @squish/sdk
 *
 * SDK for building on squish-memory's AI memory system.
 * Provides pluggable interfaces for storage, embeddings, LLM, and events.
 */

// ─── Re-export All Types ─────────────────────────────────────────────────────

export type {
  // Core re-exports
  MemoryRecord,
  MemoryType,
  ConfidenceLevel,
  RecallOptions,
  EntityRecord,
  EntityRelation,
  GraphTraversalResult,
  SemanticResult,
  RecallResult,
  // SDK-specific types
  SquishConfig,
  ClientOptions,
  SearchResult,
  PluginHook,
  PluginHookContext,
  EventType,
  // Event types
  SquishEvent,
  EventBus,
  GraphBuildStats,
  // Storage interface types
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
  // Embedding interface types
  EmbeddingProvider,
  MultimodalInput,
  EmbeddingConfig,
  // LLM interface types
  LLMProvider,
  LLMCallOptions,
  LLMContentPart,
  LLMConfig,
} from './types.js';

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Base error class for all SDK errors.
 */
export class SquishError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SquishError';
  }
}

/**
 * Thrown when the SDK is not properly configured.
 */
export class ConfigError extends SquishError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when a storage operation fails.
 */
export class StorageError extends SquishError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_ERROR', cause);
    this.name = 'StorageError';
  }
}

/**
 * Thrown when an embedding operation fails.
 */
export class EmbeddingError extends SquishError {
  constructor(message: string, cause?: Error) {
    super(message, 'EMBEDDING_ERROR', cause);
    this.name = 'EmbeddingError';
  }
}

/**
 * Thrown when an LLM operation fails.
 */
export class LLMError extends SquishError {
  constructor(message: string, cause?: Error) {
    super(message, 'LLM_ERROR', cause);
    this.name = 'LLMError';
  }
}

/**
 * Thrown when a resource is not found.
 */
export class NotFoundError extends SquishError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

// ─── SquishClient ───────────────────────────────────────────────────────────

import type {
  ClientOptions,
  SquishConfig,
  MemoryRecord as SdkMemoryRecord,
  RecallResult,
  SearchResult,
  EntityRecord,
  EntityRelation,
  GraphTraversalResult,
  ProjectRecord,
  MemoryType,
  RememberOptions,
  SearchOptions,
  RecallClientOptions,
  GraphOptions,
  ContextOptions,
  MemoryStats,
  HealthResult,
} from './types.js';
import type { RecallOptions as CoreRecallOptions } from './interfaces/storage.js';

/**
 * Main SDK client for interacting with the squish memory system.
 *
 * Wraps the core engine and provides a clean typed API for all major
 * memory operations: storing, recalling, searching, and graph traversal.
 *
 * @example
 * ```ts
 * import { SquishClient } from '@squish/sdk';
 *
 * const client = new SquishClient({
 *   dataDir: '~/.local/share/squish',
 *   project: '/path/to/project',
 * });
 *
 * // Store a memory
 * await client.remember('Important design decision: use event-driven architecture');
 *
 * // Recall memories
 * const results = await client.recall('architecture decisions');
 *
 * // Search semantically
 * const searchResults = await client.search('event driven', { limit: 5 });
 *
 * // Close when done
 * await client.close();
 * ```
 */
export class SquishClient {
  private readonly config: SquishConfig;
  private _activeProject: string | undefined;

  constructor(options: ClientOptions = {}) {
    this.config = {
      dataDir: options.dataDir,
      project: options.project,
      storage: options.storage,
      embeddings: options.embeddings,
      llm: options.llm,
      events: options.events,
      lifecycleEnabled: options.lifecycleEnabled,
      graphAutoBuild: options.graphAutoBuild,
      consolidationEnabled: options.consolidationEnabled,
    };
    this._activeProject = options.project;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<SquishConfig> {
    return Object.freeze({ ...this.config });
  }

  // ─── Storage Operations ──────────────────────────────────────────────────

  /**
   * Store a memory in the system.
   *
   * @param content - The memory content (non-empty string)
   * @param options - Optional configuration for the memory
   * @returns The stored memory record
   *
   * @example
   * ```ts
   * const memory = await client.remember(
   *   'Use event-driven architecture for the payment service',
   *   { type: 'decision', tags: ['architecture', 'payments'], importance: 85 }
   * );
   * console.log(memory.id); // UUID of stored memory
   * ```
   */
  async remember(content: string, options?: RememberOptions): Promise<SdkMemoryRecord> {
    try {
      if (!content?.trim()) {
        throw new SquishError('Content cannot be empty', 'VALIDATION_ERROR');
      }

      const { storeMemory } = await import('../../../core/storage/storage-facade.js');
      const coreMemory = await storeMemory({
        content: content.trim(),
        type: options?.type,
        tags: options?.tags,
        project: options?.project ?? this._activeProject,
        user: options?.user,
        metadata: options?.metadata,
        sessionId: options?.sessionId,
      });

      return mapCoreMemoryToSdk(coreMemory);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to store memory', error as Error);
    }
  }

  /**
   * Recall memories using intelligent routing.
   *
   * Routes the query to the optimal retrieval strategy (hybrid search,
   * entity-aware, multi-hop, etc.) based on query classification.
   *
   * @param query - The recall query
   * @param options - Optional filters and limits
   * @returns RecallResult with memories, routing info, and metadata
   *
   * @example
   * ```ts
   * const result = await client.recall('architecture decisions', { limit: 5 });
   * console.log(result.memories.length); // Number of results
   * console.log(result.routing.strategy); // Strategy used
   * ```
   */
  async recall(query: string, options?: RecallClientOptions): Promise<RecallResult> {
    try {
      if (!query?.trim()) {
        throw new SquishError('Query cannot be empty', 'VALIDATION_ERROR');
      }

      const { recall } = await import('../../../core/storage/storage-facade.js');
      const coreResult = await recall(query.trim(), {
        project: options?.project ?? this._activeProject,
        limit: options?.limit,
        type: options?.type,
        tags: options?.tags,
        strategy: options?.strategy,
      });

      return {
        memories: coreResult.memories.map(mapCoreMemoryToSdk),
        graphEntities: coreResult.graphEntities,
        routing: coreResult.routing,
        metadata: coreResult.metadata,
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to recall memories', error as Error);
    }
  }

  /**
   * Search memories semantically using hybrid vector + keyword search.
   *
   * @param query - The search query
   * @param options - Optional search configuration
   * @returns Array of search results with scores
   *
   * @example
   * ```ts
   * const results = await client.search('event driven', { limit: 5, minScore: 0.3 });
   * for (const result of results) {
   *   console.log(`${result.score.toFixed(2)}: ${result.content}`);
   * }
   * ```
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    try {
      if (!query?.trim()) {
        throw new SquishError('Query cannot be empty', 'VALIDATION_ERROR');
      }

      const { queryMemories } = await import('../../../core/storage/storage-facade.js');
      const coreResults = await queryMemories({
        query: query.trim(),
        limit: options?.limit ?? 10,
        project: options?.project ?? this._activeProject,
      });

      let results = coreResults.map(mapCoreSearchResultToSdk);

      // Apply minimum score filter if specified
      if (options?.minScore != null && options.minScore > 0) {
        results = results.filter(r => r.score >= options.minScore!);
      }

      return results;
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to search memories', error as Error);
    }
  }

  /**
   * Get a memory by its ID.
   *
   * @param id - The memory UUID
   * @returns The memory record, or null if not found
   *
   * @example
   * ```ts
   * const memory = await client.getById('550e8400-e29b-41d4-a716-446655440000');
   * if (memory) {
   *   console.log(memory.content);
   * }
   * ```
   */
  async getById(id: string): Promise<SdkMemoryRecord | null> {
    try {
      if (!id?.trim()) {
        throw new SquishError('ID cannot be empty', 'VALIDATION_ERROR');
      }

      const { getMemoryById } = await import('../../../core/storage/storage-facade.js');
      const coreMemory = await getMemoryById(id.trim());
      if (!coreMemory) return null;

      return mapCoreMemoryToSdk(coreMemory);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get memory', error as Error);
    }
  }

  /**
   * Delete a memory by ID.
   *
   * @param id - The memory UUID to delete
   * @returns true if deleted, false if not found
   *
   * @example
   * ```ts
   * const deleted = await client.forget('550e8400-e29b-41d4-a716-446655440000');
   * console.log(deleted); // true
   * ```
   */
  async forget(id: string): Promise<boolean> {
    try {
      if (!id?.trim()) {
        throw new SquishError('ID cannot be empty', 'VALIDATION_ERROR');
      }

      const { deleteMemoryPermanently } = await import('../../../core/memory/stale-cleaner.js');
      await deleteMemoryPermanently(id.trim());
      return true;
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to delete memory', error as Error);
    }
  }

  // ─── Graph Operations ────────────────────────────────────────────────────

  /**
   * Get an entity by name with its relations and mention count.
   *
   * @param name - Entity name to look up
   * @param project - Optional project path (uses active project if omitted)
   * @returns Entity info with relations, or null if not found
   *
   * @example
   * ```ts
   * const entity = await client.getEntity('PaymentService');
   * if (entity) {
   *   console.log(entity.entity.name);
   *   console.log(entity.relations.length);
   * }
   * ```
   */
  async getEntity(
    name: string,
    project?: string
  ): Promise<{ entity: EntityRecord | null; relations: EntityRelation[]; mentionCount: number } | null> {
    try {
      if (!name?.trim()) {
        throw new SquishError('Entity name cannot be empty', 'VALIDATION_ERROR');
      }

      const projectId = project ?? this._activeProject;
      if (!projectId) {
        throw new SquishError('Project is required for getEntity', 'VALIDATION_ERROR');
      }

      const { getEntity } = await import('../../../core/storage/entity-ops.js');
      return await getEntity(name.trim(), projectId);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get entity', error as Error);
    }
  }

  /**
   * Traverse the knowledge graph from an entity.
   *
   * @param name - Starting entity name
   * @param project - Optional project path (uses active project if omitted)
   * @param options - Traversal options (maxDepth, limit)
   * @returns Graph traversal result with nodes, edges, and paths
   *
   * @example
   * ```ts
   * const graph = await client.traverseGraph('PaymentService', undefined, { maxDepth: 2 });
   * console.log(graph.nodes.length); // Number of connected entities
   * console.log(graph.edges.length); // Number of relationships
   * ```
   */
  async traverseGraph(
    name: string,
    project?: string,
    options?: GraphOptions
  ): Promise<GraphTraversalResult> {
    try {
      if (!name?.trim()) {
        throw new SquishError('Entity name cannot be empty', 'VALIDATION_ERROR');
      }

      const projectId = project ?? this._activeProject;
      if (!projectId) {
        throw new SquishError('Project is required for traverseGraph', 'VALIDATION_ERROR');
      }

      const { traverseGraph } = await import('../../../core/storage/graph-ops.js');
      return await traverseGraph(name.trim(), projectId, {
        maxDepth: options?.maxDepth,
        limit: options?.limit,
      });
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to traverse graph', error as Error);
    }
  }

  // ─── Context & Projects ──────────────────────────────────────────────────

  /**
   * Get contextual memories for the current session.
   *
   * Returns recent and important memories relevant to the current project.
   *
   * @param options - Optional configuration
   * @returns Array of memory records
   *
   * @example
   * ```ts
   * const context = await client.getContext({ limit: 10 });
   * for (const memory of context) {
   *   console.log(memory.content);
   * }
   * ```
   */
  async getContext(options?: ContextOptions): Promise<SdkMemoryRecord[]> {
    try {
      const project = options?.project ?? this._activeProject;
      const limit = options?.limit ?? 10;

      const { recall } = await import('../../../core/storage/storage-facade.js');
      const result = await recall('', {
        project,
        limit,
      });

      return result.memories.map(mapCoreMemoryToSdk);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get context', error as Error);
    }
  }

  /**
   * List all registered projects.
   *
   * @returns Array of project records
   *
   * @example
   * ```ts
   * const projects = await client.listProjects();
   * for (const project of projects) {
   *   console.log(`${project.name} (${project.path})`);
   * }
   * ```
   */
  async listProjects(): Promise<ProjectRecord[]> {
    try {
      const { getAllProjects } = await import('../../../core/projects.js');
      return await getAllProjects();
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to list projects', error as Error);
    }
  }

  /**
   * Set the active project for subsequent operations.
   *
   * @param project - Project path to set as active
   *
   * @example
   * ```ts
   * client.setProject('/path/to/my/project');
   * // All subsequent calls will use this project scope
   * await client.remember('Project-specific memory');
   * ```
   */
  setProject(project: string): void {
    if (!project?.trim()) {
      throw new SquishError('Project path cannot be empty', 'VALIDATION_ERROR');
    }
    this._activeProject = project.trim();
  }

  // ─── Stats & Health ──────────────────────────────────────────────────────

  /**
   * Get memory statistics for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Memory statistics including counts, types, and timestamps
   *
   * @example
   * ```ts
   * const stats = await client.stats();
   * console.log(`Total memories: ${stats.totalMemories}`);
   * console.log(`By type:`, stats.byType);
   * ```
   */
  async stats(project?: string): Promise<MemoryStats> {
    try {
      const { getMemoryStats } = await import('../../../core/memory/stats.js');
      return await getMemoryStats(project ?? this._activeProject);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get stats', error as Error);
    }
  }

  /**
   * Check the health of the memory system.
   *
   * @returns Health status with per-component details
   *
   * @example
   * ```ts
   * const health = await client.health();
   * console.log(health.status); // 'ok', 'degraded', or 'error'
   * console.log(health.components); // { database: 'ok', embeddings: 'ok', ... }
   * ```
   */
  async health(): Promise<HealthResult> {
    const components: Record<string, string> = {};

    try {
      // Check database connectivity
      const { getDb } = await import('../../../db/index.js');
      const db = await getDb();
      if (db) {
        components['database'] = 'ok';
      } else {
        components['database'] = 'error: no connection';
      }
    } catch (error) {
      components['database'] = `error: ${error instanceof Error ? error.message : 'unknown'}`;
    }

    try {
      // Check embeddings availability
      const { getEmbedding } = await import('../../../core/embeddings.js');
      await getEmbedding('health check');
      components['embeddings'] = 'ok';
    } catch (error) {
      components['embeddings'] = `degraded: ${error instanceof Error ? error.message : 'unknown'}`;
    }

    const hasErrors = Object.values(components).some(v => v.startsWith('error'));
    const hasDegraded = Object.values(components).some(v => v.startsWith('degraded'));

    return {
      status: hasErrors ? 'error' : hasDegraded ? 'degraded' : 'ok',
      components,
    };
  }

  /**
   * Close the client and release resources.
   */
  async close(): Promise<void> {
    // No persistent resources to clean up in the SDK wrapper
  }
}

// ─── Mapping Helpers ────────────────────────────────────────────────────────

/**
 * Map a core MemoryRecord to the SDK MemoryRecord type.
 * Core uses string timestamps; SDK uses Date objects.
 */
function mapCoreMemoryToSdk(core: any): SdkMemoryRecord {
  return {
    id: core.id,
    content: core.content,
    type: core.type,
    tags: core.tags ?? [],
    importance: core.importance ?? 0,
    project: core.projectId ?? undefined,
    sessionId: core.sessionId ?? undefined,
    createdAt: core.createdAt ? new Date(core.createdAt) : new Date(),
    updatedAt: core.updatedAt ? new Date(core.updatedAt) : new Date(),
    lastAccessedAt: core.lastAccessedAt ? new Date(core.lastAccessedAt) : undefined,
    accessCount: core.accessCount ?? 0,
    decayScore: core.decayScore ?? 0,
  };
}

/**
 * Map a core search result to the SDK SearchResult type.
 */
function mapCoreSearchResultToSdk(core: any): SearchResult {
  const memory = mapCoreMemoryToSdk(core);
  return {
    memory: {
      id: memory.id,
      content: memory.content,
      type: memory.type,
      tags: memory.tags,
      importance: memory.importance,
      project: memory.project,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    },
    score: core.similarity ?? 0,
    source: 'hybrid',
  };
}
