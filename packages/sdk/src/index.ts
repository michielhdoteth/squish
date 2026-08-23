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
  // New SDK types
  PinOptions,
  SessionOptions,
  MaintenanceOptions,
  SchemaHealthResult,
  TrustState,
  SignalResult,
  AssociationResult,
  PlaceRecord,
  SessionRecord,
  ChunkRecord,
} from './types.js';

// ─── Plugin Registry ────────────────────────────────────────────────────────

export { PluginRegistry, type Plugin } from './plugins.js';

// ─── Event System ────────────────────────────────────────────────────────────
export { DefaultEventBus } from './events/event-bus.js';

// ─── Core Module Re-exports ──────────────────────────────────────────────────
// These allow CLI and MCP to import from '@squish/sdk' instead of
// using deep relative paths (../../../) into core internals.

// ─── Config ──────────────────────────────────────────────────────────────────
export { config, getDataDir, detectProjectScope } from '../../../config.js';

// ─── Logger ──────────────────────────────────────────────────────────────────
export { logger } from '../../../core/logger.js';

// ─── Database ────────────────────────────────────────────────────────────────
export { getDb } from '../../../db/index.js';
export {
  probeSchemaHealth,
  fixSchemaIssues,
  isSchemaDriftError,
  type SchemaProbeResult,
} from '../../../db/schema-health.js';
export { ensureSqliteSchema } from '../../../db/bootstrap.js';

// ─── Runtime ─────────────────────────────────────────────────────────────────
export { getInstallShadowDiagnostic } from '../../../core/runtime/install-diagnostics.js';
export {
  buildHealthState,
  buildStatsState,
  buildContextState,
  buildInspectState,
  resolveProjectScope,
} from '../../../core/runtime/trust-state.js';
export {
  formatHealthReport,
  formatStatsReport,
  formatContextReport,
} from '../../../core/runtime/trust-report.js';

// ─── Memory ──────────────────────────────────────────────────────────────────
export { getMemory } from '../../../core/memory/memories.js';
export { promoteToSturdy } from '../../../core/memory/tiers.js';
export { detectMemorySignals } from '../../../core/memory/trigger-detector.js';
export { migrateMemories, type MigrateResult } from '../../../core/memory/migrate.js';

// ─── Security ────────────────────────────────────────────────────────────────
export { pinMemory, unpinMemory } from '../../../core/security/governance.js';

// ─── Associations ────────────────────────────────────────────────────────────
export { createAssociation, getRelatedMemories } from '../../../core/associations.js';

// ─── Snapshots ───────────────────────────────────────────────────────────────
export { getMemorySnapshot } from '../../../core/snapshots/retrieval.js';

// ─── Ingestion ───────────────────────────────────────────────────────────────
export { shouldReturnRawFallback } from '../../../core/ingestion/signal-engine.js';
export { createLearning } from '../../../core/ingestion/learnings.js';

// ─── Sessions ────────────────────────────────────────────────────────────────
export {
  listSessions,
  getSessionChunks,
  searchChunks,
} from '../../../core/sessions/index.js';
export { allAgentStores } from '../../../core/sessions/agent-stores/registry.js';

// ─── Embeddings ──────────────────────────────────────────────────────────────
export { getQMDClient } from '../../../core/embeddings/qmd-client.js';

// ─── Utilities ───────────────────────────────────────────────────────────────
export { filterByDateRange } from '../../../core/lib/utils.js';

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
  GraphBuildStats,
  ProjectRecord,
  MemoryType,
  RememberOptions,
  SearchOptions,
  RecallClientOptions,
  GraphOptions,
  ContextOptions,
  MemoryStats,
  HealthResult,
  PinOptions,
  SessionOptions,
  MaintenanceOptions,
  SchemaHealthResult,
  TrustState,
  SignalResult,
  AssociationResult,
  PlaceRecord,
  SessionRecord,
  ChunkRecord,
  LearningInput,
  LearningRecord,
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
        strategy: options?.strategy as any,
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
      }) as any;
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

  // ─── Governance ──────────────────────────────────────────────────────────

  /**
   * Pin a memory to prevent it from being cleaned up by consolidation.
   *
   * @param id - The memory UUID to pin
   * @param options - Optional pin configuration
   */
  async pinMemory(id: string, options?: PinOptions): Promise<void> {
    try {
      const { pinMemory } = await import('../../../core/security/governance.js');
      await pinMemory(id);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to pin memory', error as Error);
    }
  }

  /**
   * Unpin a memory to allow it to be cleaned up by consolidation.
   *
   * @param id - The memory UUID to unpin
   * @param options - Optional unpin configuration
   */
  async unpinMemory(id: string, options?: PinOptions): Promise<void> {
    try {
      const { unpinMemory } = await import('../../../core/security/governance.js');
      await unpinMemory(id);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to unpin memory', error as Error);
    }
  }

  /**
   * Get all pinned memories for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Array of pinned memory records
   */
  async getPinnedMemories(project?: string): Promise<SdkMemoryRecord[]> {
    try {
      const { getPinnedMemories } = await import('../../../core/security/governance.js');
      const memories = await getPinnedMemories(project ?? this._activeProject);
      return memories.map(mapCoreMemoryToSdk);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get pinned memories', error as Error);
    }
  }

  // ─── Memory Tiers ────────────────────────────────────────────────────────

  /**
   * Promote a memory to the "sturdy" tier for longer retention.
   *
   * @param id - The memory UUID to promote
   */
  async promoteToSturdy(id: string): Promise<void> {
    try {
      const { promoteToSturdy } = await import('../../../core/memory/tiers.js');
      await promoteToSturdy(id);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to promote memory', error as Error);
    }
  }

  /**
   * Get statistics about memory distribution across tiers.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Map of tier name to memory count
   */
  async getTierStats(project?: string): Promise<Record<string, number>> {
    try {
      const { getTierStats } = await import('../../../core/memory/tiers.js');
      return await getTierStats(project ?? this._activeProject);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get tier stats', error as Error);
    }
  }

  // ─── Memory Retrieval ────────────────────────────────────────────────────

  /**
   * Get the most recently created memories.
   *
   * @param limit - Maximum number of memories to return (default 10)
   * @param project - Optional project path (uses active project if omitted)
   * @returns Array of recent memory records
   */
  async getRecent(limit?: number, project?: string): Promise<SdkMemoryRecord[]> {
    try {
      const { getRecent } = await import('../../../core/memory/memories.js');
      const memories = await getRecent(project ?? this._activeProject!, limit ?? 10);
      return memories.map(mapCoreMemoryToSdk);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get recent memories', error as Error);
    }
  }

  /**
   * Get a snapshot of the memory system for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Memory snapshot data
   */
  async getMemorySnapshot(project?: string): Promise<unknown> {
    try {
      const { getMemorySnapshot } = await import('../../../core/snapshots/retrieval.js');
      return await getMemorySnapshot(project ?? this._activeProject!);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get memory snapshot', error as Error);
    }
  }

  // ─── Associations ────────────────────────────────────────────────────────

  /**
   * Create an association between two memories.
   *
   * @param fromId - Source memory ID
   * @param toId - Target memory ID
   * @param type - Optional association type label
   * @returns The created association record
   */
  async createAssociation(fromId: string, toId: string, type?: string): Promise<void> {
    try {
      const { createAssociation } = await import('../../../core/associations.js');
      await createAssociation(fromId, toId, type as any);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to create association', error as Error);
    }
  }

  /**
   * Get all memories associated with a given memory.
   *
   * @param id - The memory UUID to find associations for
   * @returns Array of related memory records
   */
  async getRelatedMemories(id: string): Promise<SdkMemoryRecord[]> {
    try {
      const { getRelatedMemories } = await import('../../../core/associations.js');
      const memories = await getRelatedMemories(id);
      return memories.map(mapCoreMemoryToSdk);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get related memories', error as Error);
    }
  }

  // ─── Graph Building ──────────────────────────────────────────────────────

  /**
   * Rebuild the knowledge graph for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Graph build statistics
   */
  async buildGraph(project?: string): Promise<GraphBuildStats> {
    try {
      const { buildGraphForProject } = await import('../../../core/graph/graph-builder.js');
      const stats = await buildGraphForProject(project ?? this._activeProject!);
      return {
        memoriesProcessed: stats.memoriesProcessed,
        entitiesCreated: stats.entitiesCreated,
        relationsCreated: stats.relationsCreated,
        entitiesDeduplicated: stats.entitiesDeduplicated,
        errors: stats.errors,
        durationMs: stats.durationMs,
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to build graph', error as Error);
    }
  }

  // ─── Places ──────────────────────────────────────────────────────────────

  /**
   * Get all memory places for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Array of place records
   */
  async getPlaces(project?: string): Promise<PlaceRecord[]> {
    try {
      const { getProjectPlaces } = await import('../../../core/places/places.js');
      const projectId = project ?? this._activeProject;
      const places = await getProjectPlaces(projectId);
      return places.map((p: any) => ({
        id: p.id,
        name: p.name,
        memories: [],
      }));
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get places', error as Error);
    }
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  /**
   * List sessions with optional filtering.
   *
   * @param options - Optional session list configuration
   * @returns Array of session records
   */
  async listSessions(options?: SessionOptions): Promise<SessionRecord[]> {
    try {
      const { listSessions } = await import('../../../core/sessions/index.js');
      const result = await listSessions({ project: options?.project ?? this._activeProject, limit: options?.limit });
      return result.sessions.map((s: any) => ({
        id: s.session_id,
        title: s.title,
        project: s.project,
        branch: s.branch,
        agent: s.agent,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        status: s.status,
        chunkCount: s.chunk_count,
        memoryCount: s.chunk_count,
      }));
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to list sessions', error as Error);
    }
  }

  /**
   * Get all chunks for a specific session.
   *
   * @param sessionId - The session ID to retrieve chunks for
   * @returns Array of chunk records
   */
  async getSessionChunks(sessionId: string): Promise<ChunkRecord[]> {
    try {
      const { getSessionChunks } = await import('../../../core/sessions/index.js');
      const result = await getSessionChunks(sessionId);
      if (!result?.chunks) return [];
      return result.chunks.map((c: any) => ({
        id: c.id,
        sessionId: c.session_id,
        content: c.content,
        type: c.chunk_type,
      }));
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to get session chunks', error as Error);
    }
  }

  /**
   * Search session chunks by content.
   *
   * @param query - Search query to match against chunk content
   * @param options - Optional search configuration
   * @returns Array of matching chunk records
   */
  async searchChunks(query: string, options?: { limit?: number }): Promise<ChunkRecord[]> {
    try {
      const { searchChunks } = await import('../../../core/sessions/index.js');
      const results = await searchChunks({ query, limit: options?.limit });
      return results.map((r: any) => ({
        id: r.chunk?.id ?? '',
        sessionId: r.chunk?.session_id ?? '',
        content: r.chunk?.content ?? '',
        type: r.chunk?.chunk_type ?? '',
      }));
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to search chunks', error as Error);
    }
  }

  // ─── Consolidation ───────────────────────────────────────────────────────

  /**
   * Run full memory maintenance (consolidation, decay, cleanup).
   *
   * @param options - Optional maintenance configuration
   * @returns Maintenance result data
   */
  async runMaintenance(options?: MaintenanceOptions): Promise<unknown> {
    try {
      const { runFullMaintenance } = await import('../../../core/consolidation.js');
      return await runFullMaintenance({
        projectId: options?.project ?? this._activeProject,
        dryRun: options?.dryRun,
        steps: options?.steps as any,
        age: options?.age,
        llmEnabled: options?.llmEnabled,
      });
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to run maintenance', error as Error);
    }
  }

  // ─── Migrations ──────────────────────────────────────────────────────────

  /**
   * Run memory migration to update schema or data format.
   *
   * @returns Migration result data
   */
  async migrateMemories(sourceDir?: string, targetDir?: string): Promise<unknown> {
    try {
      const { migrateMemories } = await import('../../../core/memory/migrate.js');
      const src = sourceDir ?? this._activeProject ?? '.';
      const tgt = targetDir ?? src;
      return await migrateMemories(src, tgt);
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to migrate memories', error as Error);
    }
  }

  // ─── Schema Health ───────────────────────────────────────────────────────

  /**
   * Probe the schema health for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Schema health result with issues and fixes
   */
  async probeSchemaHealth(): Promise<SchemaHealthResult> {
    try {
      const { probeSchemaHealth } = await import('../../../db/schema-health.js');
      const result = await probeSchemaHealth();
      return {
        healthy: result.status === 'ok',
        issues: result.missingTables.length > 0 || result.missingColumns.length > 0
          ? [result.detail]
          : [],
        fixes: result.remediation ? [result.remediation] : [],
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to probe schema health', error as Error);
    }
  }

  /**
   * Fix schema issues for a project.
   *
   * @returns Schema health result after fixes
   */
  async fixSchemaIssues(): Promise<SchemaHealthResult> {
    try {
      const { fixSchemaIssues } = await import('../../../db/schema-health.js');
      const actions = await fixSchemaIssues();
      return {
        healthy: actions.length === 0,
        issues: actions.map((a: any) => a.detail ?? a.type ?? 'fix'),
        fixes: actions.map((a: any) => a.detail ?? a.type ?? 'fix'),
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to fix schema issues', error as Error);
    }
  }

  // ─── Trust State ─────────────────────────────────────────────────────────

  /**
   * Build the context trust state for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Trust state with context data
   */
  async buildContextState(project?: string): Promise<TrustState> {
    try {
      const { buildContextState } = await import('../../../core/runtime/trust-state.js');
      const result = await buildContextState(project ?? this._activeProject);
      return {
        project: result.currentProject.path,
        mode: result.currentProject.resolution,
        stats: {},
        context: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to build context state', error as Error);
    }
  }

  /**
   * Build the stats trust state for a project.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Trust state with stats data
   */
  async buildStatsState(project?: string): Promise<TrustState> {
    try {
      const { buildStatsState } = await import('../../../core/runtime/trust-state.js');
      const result = await buildStatsState(project ?? this._activeProject);
      return {
        project: result.currentProject,
        mode: 'stats',
        stats: result as unknown as Record<string, unknown>,
        context: {},
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to build stats state', error as Error);
    }
  }

  /**
   * Resolve the project scope for a given project path.
   *
   * @param project - Optional project path (uses active project if omitted)
   * @returns Resolved project scope string
   */
  async resolveProjectScope(project?: string): Promise<string> {
    try {
      const { resolveProjectScope } = await import('../../../core/runtime/trust-state.js');
      const result = await resolveProjectScope(project ?? this._activeProject);
      return result.currentProject?.path ?? project ?? this._activeProject ?? '';
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to resolve project scope', error as Error);
    }
  }

  // ─── Scheduler ───────────────────────────────────────────────────────────

  /**
   * Initialize the cron scheduler for automated maintenance tasks.
   *
   * @param options - Optional scheduler configuration
   */
  async initializeScheduler(): Promise<void> {
    try {
      const { initializeScheduler } = await import('../../../core/scheduler/cron-scheduler.js');
      await initializeScheduler();
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to initialize scheduler', error as Error);
    }
  }

  // ─── Signals ─────────────────────────────────────────────────────────────

  /**
   * Detect memory-related signals in content (e.g. task, decision, error).
   *
   * @param content - The content to analyze for signals
   * @returns Signal detection result
   */
  async detectMemorySignals(content: string): Promise<SignalResult> {
    try {
      const { detectMemorySignals } = await import('../../../core/memory/trigger-detector.js');
      const result = detectMemorySignals(content);
      const hasSignal = result.explicitTriggers.length > 0 ||
        Object.values(result.implicit).some(v => v === true);
      return {
        signals: result.explicitTriggers,
        hasSignal,
      };
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to detect memory signals', error as Error);
    }
  }

  // ─── Learnings ───────────────────────────────────────────────────────────

  /**
   * Create a learning record from structured input.
   *
   * @param input - The learning input data
   * @returns The created learning record
   */
  async createLearning(input: LearningInput): Promise<LearningRecord> {
    try {
      const { createLearning } = await import('../../../core/ingestion/learnings.js');
      const validTypes = ['success', 'failure', 'fix', 'insight'];
      const learningType = validTypes.includes(input.type) ? input.type : 'insight';
      return await createLearning({
        type: learningType as 'success' | 'failure' | 'fix' | 'insight',
        content: input.content,
        context: input.context,
        action: input.action,
        target: input.target,
        project: input.project ?? this._activeProject,
        memoryId: input.memoryId,
      });
    } catch (error) {
      if (error instanceof SquishError) throw error;
      throw new StorageError('Failed to create learning', error as Error);
    }
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
