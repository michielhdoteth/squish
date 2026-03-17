import { sqliteTable, text, integer, blob, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ============================================================================
// Core Tables - SQLite compatible version
// ============================================================================

/**
 * Users - represents Claude Code users
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  externalId: text('external_id').unique(), // Claude user ID if available
  name: text('name'),
  email: text('email'),
  preferences: text('preferences').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Projects - workspaces that memories are scoped to
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  name: text('name').notNull(),
  path: text('path').notNull(),
  description: text('description'),
  metadata: text('metadata').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('projects_path_idx').on(table.path),
]);

/**
 * Memories - core memory storage
 */
export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey().$default(() => crypto.randomUUID()),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Content
    type: text('type').notNull().$type<'observation' | 'fact' | 'decision' | 'context' | 'preference'>(),
    content: text('content').notNull(),
    summary: text('summary'),

    // Embeddings stored as JSON string (not for semantic search in SQLite)
    embeddingJson: text('embedding_json'),

    // v0.2.0: Vector embedding for local search
    embedding: blob('embedding'),

    // Metadata
    source: text('source'),
    confidence: integer('confidence').default(100),
    tags: text('tags').$type<string[]>(),
    metadata: text('metadata').$type<Record<string, unknown>>(),

    // v0.2.0: Privacy and relevance
    isPrivate: integer('is_private', { mode: 'boolean' }).default(false),
    hasSecrets: integer('has_secrets', { mode: 'boolean' }).default(false),
    relevanceScore: integer('relevance_score').default(50), // 0-100

    // Lifecycle
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    accessCount: integer('access_count').default(0),
    lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),

    // Merge tracking
    isMerged: integer('is_merged', { mode: 'boolean' }).default(false),
    mergedIntoId: text('merged_into_id').references((): any => (memories as any).id),
    mergedAt: integer('merged_at', { mode: 'timestamp' }),
    isCanonical: integer('is_canonical', { mode: 'boolean' }).default(false),
    mergeSourceIds: text('merge_source_ids').$type<string[]>(),
    isMergeable: integer('is_mergeable', { mode: 'boolean' }).default(true),
    mergeVersion: integer('merge_version').default(1),

    // v0.4.2: Namespace support
    namespaceId: text('namespace_id').references(() => namespaces.id, { onDelete: 'set null' }),
    namespacePath: text('namespace_path'),

    // v0.4.3: Layer support
    hasL0Abstract: integer('has_l0_abstract', { mode: 'boolean' }).default(false),
    hasL1Overview: integer('has_l1_overview', { mode: 'boolean' }).default(false),
    lastLayerUpdate: integer('last_layer_update', { mode: 'timestamp' }),

    // v0.8.0: Importance Scoring
    importanceScore: integer('importance_score').default(50), // 0-100
    importanceDecayRate: integer('importance_decay_rate').default(30), // days half-life
    lastImportanceRecalc: integer('last_importance_recalc', { mode: 'timestamp' }),

    // v0.10.0: Echo/Fizzle Tracking - Retrieval Priority
    retrievalPriority: integer('retrieval_priority').default(50), // 0-100, adjusted by feedback

    // v0.8.0: Consolidation tracking
    consolidatedInto: text('consolidated_into').references((): any => (memories as any).id),
    consolidatedAt: integer('consolidated_at', { mode: 'timestamp' }),
    isConsolidated: integer('is_consolidated', { mode: 'boolean' }).default(false),

    // v0.3.0: Memory Lifecycle Management
    sector: text('sector').$type<'episodic' | 'semantic' | 'procedural' | 'autobiographical' | 'working'>().default('episodic'),
    tier: text('tier').$type<'hot' | 'warm' | 'cold'>().default('hot'),

    // v0.5.0: Context Status - Track whether memory is in active context or archived
    contextStatus: text('context_status').$type<'in-context' | 'out-of-context' | 'archived'>().default('out-of-context'),

    decayRate: integer('decay_rate').default(30),
    coactivationScore: integer('coactivation_score').default(0),
    lastDecayAt: integer('last_decay_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),

    // v0.3.0: Agent-Aware Memory
    agentId: text('agent_id'),
    agentRole: text('agent_role'),
    visibilityScope: text('visibility_scope').$type<'private' | 'project' | 'team' | 'global'>().default('private'),

    // v0.3.0: Memory Governance
    isProtected: integer('is_protected', { mode: 'boolean' }).default(false),
    isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
    isImmutable: integer('is_immutable', { mode: 'boolean' }).default(false),
    writeScope: text('write_scope').$type<string[]>(),
    readScope: text('read_scope').$type<string[]>(),

    // v0.3.0: Provenance
    triggeredBy: text('triggered_by'),
    captureReason: text('capture_reason'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    usageCount: integer('usage_count').default(0),

    // v0.3.0: Temporal Facts
    validFrom: integer('valid_from', { mode: 'timestamp' }),
    validTo: integer('valid_to', { mode: 'timestamp' }),
    recordedAt: integer('recorded_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(), // When agent learned/stored the fact
    supersededBy: text('superseded_by').references((): any => (memories as any).id),
    version: integer('version').default(1),

    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table): any => [
    index('memories_project_idx').on(table.projectId),
    index('memories_type_idx').on(table.type),
    index('memories_created_idx').on(table.createdAt),
    index('memories_tags_idx').on(table.tags),
    index('memories_relevance_idx').on(table.relevanceScore),
    index('memories_private_idx').on(table.isPrivate),
    index('memories_merged_idx').on(table.isMerged),
    index('memories_canonical_idx').on(table.isCanonical),
    index('memories_sector_idx').on(table.sector),
    index('memories_tier_idx').on(table.tier),
    index('memories_agent_idx').on(table.agentId),
    index('memories_visibility_idx').on(table.visibilityScope),
    index('memories_protected_idx').on(table.isProtected),
    index('memories_pinned_idx').on(table.isPinned),
    index('memories_valid_from_idx').on(table.validFrom),
    index('memories_valid_to_idx').on(table.validTo),
    index('memories_context_status_idx').on(table.contextStatus),

    // v0.8.0: Importance scoring indexes
    index('memories_importance_idx').on(table.importanceScore),
    index('memories_consolidated_idx').on(table.isConsolidated),
    index('memories_consolidation_query_idx').on(
      table.projectId,
      table.isConsolidated,
      table.importanceScore
    ),

    // v0.5.0: Context status composite index for efficient filtering
    index('memories_context_query_idx').on(
      table.projectId,
      table.contextStatus,
      table.tier
    ),

    // v0.4.2: Composite indexes for performance optimization
    // Duplicate detection query optimization
    index('memories_duplicate_detection_idx').on(
      table.projectId,
      table.isMerged,
      table.isMergeable,
      table.isActive
    ),
    // Eviction query optimization
    index('memories_eviction_idx').on(
      table.projectId,
      table.tier,
      table.relevanceScore,
      table.createdAt
    ),
    // Decay operations optimization
    index('memories_decay_idx').on(
      table.sector,
      table.lastDecayAt,
      table.isProtected
    ),
    // Temporal query optimization
    index('memories_temporal_idx').on(
      table.projectId,
      table.validFrom,
      table.validTo
    ),
    // Agent-aware retrieval optimization
    index('memories_agent_visibility_idx').on(
      table.agentId,
      table.visibilityScope,
      table.isActive
    ),
  ],
) as any;

/**
 * Conversations - chat session tracking
 */
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

  sessionId: text('session_id').notNull(),
  title: text('title'),
  summary: text('summary'),

  messageCount: integer('message_count').default(0),
  tokenCount: integer('token_count').default(0),

  startedAt: integer('started_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),

  metadata: text('metadata').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('conversations_project_idx').on(table.projectId),
  index('conversations_session_idx').on(table.sessionId),
  index('conversations_started_idx').on(table.startedAt),
]);

/**
 * Messages - individual messages in conversations
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),

  role: text('role').notNull().$type<'user' | 'assistant'>(),
  content: text('content').notNull(),

  embeddingJson: text('embedding_json'),
  tokenCount: integer('token_count'),
  toolCalls: text('tool_calls').$type<unknown[]>(),
  metadata: text('metadata').$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('messages_conversation_idx').on(table.conversationId),
  index('messages_role_idx').on(table.role),
  index('messages_created_idx').on(table.createdAt),
]);

/**
 * Observations - user observations and insights
 */
export const observations = sqliteTable('observations', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),

  type: text('type').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  summary: text('summary').notNull(),
  details: text('details').$type<Record<string, unknown>>(),

  embeddingJson: text('embedding_json'),

  // v0.2.0: Vector embedding for local search
  embedding: blob('embedding'),

  // v0.2.0: Folder-scoped observations
  folderPath: text('folder_path'),
  projectPath: text('project_path'),

  // v0.2.0: Privacy and relevance
  isPrivate: integer('is_private', { mode: 'boolean' }).default(false),
  hasSecrets: integer('has_secrets', { mode: 'boolean' }).default(false),
  relevanceScore: integer('relevance_score').default(50), // 0-100

  category: text('category'),
  importance: integer('importance').default(50),
  metadata: text('metadata').$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('observations_project_idx').on(table.projectId),
  index('observations_type_idx').on(table.type),
  index('observations_action_idx').on(table.action),
  index('observations_created_idx').on(table.createdAt),
  index('observations_folder_idx').on(table.folderPath),
  index('observations_relevance_idx').on(table.relevanceScore),
  index('observations_private_idx').on(table.isPrivate),
]);

/**
 * Entities - named entities in the codebase
 */
export const entities = sqliteTable('entities', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),

  embeddingJson: text('embedding_json'),
  properties: text('properties').$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('entities_project_idx').on(table.projectId),
  index('entities_type_idx').on(table.type),
  index('entities_name_idx').on(table.name),
]);

/**
 * Namespaces - Hierarchical folder-like namespaces for memory organization
 */
export const namespaces: any = sqliteTable('namespaces', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  parentId: text('parent_id').references(() => namespaces.id, { onDelete: 'set null' }),
  type: text('type').notNull().$type<'root' | 'user' | 'agent' | 'project' | 'custom'>(),
  description: text('description'),

  path: text('path').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('namespaces_project_idx').on(table.projectId),
  index('namespaces_parent_idx').on(table.parentId),
]);

/**
 * Memory Layers - Tiered L0/L1/L2 summaries for token-efficient retrieval
 */
export const memoryLayers = sqliteTable('memory_layers', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  memoryId: text('memory_id').references(() => memories.id, { onDelete: 'cascade' }),

  layerType: text('layer_type').notNull().$type<'l0_abstract' | 'l1_overview' | 'l2_full'>(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('memory_layers_memory_idx').on(table.memoryId),
  index('memory_layers_type_idx').on(table.layerType),
]);

// ============================================================================
// Progressive Disclosure & Context Paging Tables
// ============================================================================

/**
 * Lightweight memory indices for progressive disclosure - previews and metadata
 * used for quick filtering before loading full memories
 */
export const lightweightMemoryIndices = sqliteTable('lightweight_memory_indices', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  memoryId: text('memory_id').references(() => memories.id, { onDelete: 'cascade' }),
  
  // Hash for quick comparison
  contentHash: text('content_hash').notNull(),
  contentPreview: text('content_preview').notNull(),
  keyTerms: text('key_terms').$type<string[]>(),
  
  // Categorization
  category: text('category').notNull(),
  importanceScore: integer('importance_score').notNull(),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('lightweight_indices_memory_idx').on(table.memoryId),
  index('lightweight_indices_category_idx').on(table.category),
  index('lightweight_indices_importance_idx').on(table.importanceScore),
]);

/**
 * Context paging sessions for tracking loaded/preloaded memories
 * Agent-controlled memory loading system
 */
export const contextPagingSessions = sqliteTable('context_paging_sessions', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().unique(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Loaded memories (actively in context)
  loadedMemoryIds: text('loaded_memory_ids').$type<string[]>().default([]),
  
  // Preload candidates (ready to load if needed)
  preloadCandidateIds: text('preload_candidate_ids').$type<string[]>().default([]),
  
  // Token tracking
  tokenBudget: integer('token_budget').default(8000).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  loadedMemoriesTokens: integer('loaded_memories_tokens').default(0).notNull(),
  
  // Session metadata
  metadata: text('metadata').$type<Record<string, unknown>>(),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('context_paging_session_idx').on(table.sessionId),
  index('context_paging_project_idx').on(table.projectId),
  index('context_paging_created_idx').on(table.createdAt),
]);

// ============================================================================
// Memory Merging Tables
// ============================================================================

/**
 * Memory Merge Proposals - tracks suggested merges before user approval
 */
export const memoryMergeProposals = sqliteTable('memory_merge_proposals', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

  sourceMemoryIds: text('source_memory_ids').$type<string[]>().notNull(),
  proposedContent: text('proposed_content').notNull(),
  proposedSummary: text('proposed_summary'),
  proposedTags: text('proposed_tags').$type<string[]>(),
  proposedMetadata: text('proposed_metadata').$type<Record<string, unknown>>(),

  detectionMethod: text('detection_method').notNull().$type<'simhash' | 'minhash' | 'embedding'>(),
  similarityScore: text('similarity_score').notNull(),
  confidenceLevel: text('confidence_level').notNull().$type<'high' | 'medium' | 'low'>(),

  mergeReason: text('merge_reason').notNull(),
  conflictWarnings: text('conflict_warnings').$type<string[]>(),

  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'expired'>().default('pending').notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewNotes: text('review_notes'),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
}, (table) => [
  index('memory_merge_proposals_project_status_idx').on(table.projectId, table.status),
  index('memory_merge_proposals_created_at_idx').on(table.createdAt),
]);

/**
 * Memory Merge History - audit trail of completed merges
 */
export const memoryMergeHistory = sqliteTable('memory_merge_history', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

  proposalId: text('proposal_id').references(() => memoryMergeProposals.id, { onDelete: 'set null' }),
  sourceMemoryIds: text('source_memory_ids').$type<string[]>().notNull(),
  canonicalMemoryId: text('canonical_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),

  sourceMemoriesSnapshot: text('source_memories_snapshot').$type<Record<string, unknown>[]>().notNull(),

  mergeStrategy: text('merge_strategy').notNull().$type<'union' | 'latest' | 'voting' | 'custom'>(),
  tokensSaved: integer('tokens_saved'),

  isReversed: integer('is_reversed', { mode: 'boolean' }).default(false),
  reversedAt: integer('reversed_at', { mode: 'timestamp' }),
  reversedBy: text('reversed_by'),

  mergedAt: integer('merged_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Memory Hash Cache - cached hash signatures for efficient duplicate detection
 */
export const memoryHashCache = sqliteTable('memory_hash_cache', {
  memoryId: text('memory_id').primaryKey().references(() => memories.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),

  simhash: text('simhash'),
  minhash: text('minhash').$type<number[]>(),

  contentHash: text('content_hash').notNull(),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('memory_hash_cache_project_id_idx').on(table.projectId),
  index('memory_hash_cache_simhash_idx').on(table.simhash),
]);

/**
 * Entity Relations - relationships between entities
 */
export const entityRelations = sqliteTable('entity_relations', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  fromEntityId: text('from_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  toEntityId: text('to_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),

  type: text('type').notNull(),
  weight: integer('weight').default(1),
  properties: text('properties').$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('relations_from_idx').on(table.fromEntityId),
  index('relations_to_idx').on(table.toEntityId),
  index('relations_type_idx').on(table.type),
]);

// ============================================================================
// v0.3.0: Lifecycle Features - Associations, Summarization, Snapshots
// ============================================================================

/**
 * Memory Associations - waypoint graph for co-activation tracking
 */
export const memoryAssociations = sqliteTable('memory_associations', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  fromMemoryId: text('from_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  toMemoryId: text('to_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  associationType: text('association_type').notNull().$type<'co_occurred' | 'supersedes' | 'contradicts' | 'supports' | 'relates_to'>(),
  weight: integer('weight').default(1),
  coactivationCount: integer('coactivation_count').default(0),
  metadata: text('metadata').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastCoactivatedAt: integer('last_coactivated_at', { mode: 'timestamp' }),
}, (table) => [
  index('memory_associations_from_idx').on(table.fromMemoryId),
  index('memory_associations_to_idx').on(table.toMemoryId),
  index('memory_associations_type_idx').on(table.associationType),
  index('memory_associations_weight_idx').on(table.weight),
  // v0.4.2: Composite index for graph traversal optimization
  index('memory_associations_graph_traversal_idx').on(
    table.fromMemoryId,
    table.toMemoryId,
    table.weight,
    table.associationType
  ),
]);

/**
 * Session Summaries - incremental and rolling session summaries
 */
export const sessionSummaries = sqliteTable('session_summaries', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  summaryType: text('summary_type').notNull().$type<'incremental' | 'rolling' | 'final'>(),
  content: text('content').notNull(),
  compressedFrom: integer('compressed_from'),
  tokensSaved: integer('tokens_saved'),
  embedding: blob('embedding'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('session_summaries_conversation_idx').on(table.conversationId),
  index('session_summaries_project_idx').on(table.projectId),
  index('session_summaries_type_idx').on(table.summaryType),
  index('session_summaries_created_idx').on(table.createdAt),
]);

/**
 * Memory Snapshots - before/after diffs for auditability
 */
export const memorySnapshots = sqliteTable('memory_snapshots', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  memoryId: text('memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  snapshotType: text('snapshot_type').notNull().$type<'before_update' | 'after_update' | 'periodic'>(),
  content: text('content').notNull(),
  metadata: text('metadata').$type<Record<string, unknown>>(),
  diff: text('diff').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('memory_snapshots_memory_idx').on(table.memoryId),
  index('memory_snapshots_type_idx').on(table.snapshotType),
  index('memory_snapshots_created_idx').on(table.createdAt),
]);

/**
 * Core Memory - Always-in-context memory (Tier 1)
 * Small, persistent, always-visible memory block (< 2KB total)
 */
export const coreMemory = sqliteTable('core_memory', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

   // Core memory sections
   section: text('section').notNull().$type<'persona' | 'user_info' | 'project_context' | 'working_notes'>(),
   content: text('content').notNull().default(''),
   sizeBytes: integer('size_bytes').default(0).notNull(),
   tokensEstimate: integer('tokens_estimate').default(0).notNull(),

   // Version tracking
   version: integer('version').default(1).notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('core_memory_project_idx').on(table.projectId),
  index('core_memory_user_idx').on(table.userId),
  index('core_memory_section_idx').on(table.section),
]);

/**
 * Context Sessions - Track loaded memories and context window usage
 */
export const contextSessions = sqliteTable('context_sessions', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().unique(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Loaded memories (paging system)
  loadedMemoryIds: text('loaded_memory_ids').$type<string[]>().default([]),

  // Token tracking
  tokenBudget: integer('token_budget').default(8000).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  coreMemoryTokens: integer('core_memory_tokens').default(0).notNull(),
  loadedMemoriesTokens: integer('loaded_memories_tokens').default(0).notNull(),

  // Session metadata
  metadata: text('metadata').$type<Record<string, unknown>>(),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('context_sessions_session_idx').on(table.sessionId),
  index('context_sessions_project_idx').on(table.projectId),
  index('context_sessions_created_idx').on(table.createdAt),
]);

// ============================================================================
// Types
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;

export type EntityRelation = typeof entityRelations.$inferSelect;
export type NewEntityRelation = typeof entityRelations.$inferInsert;

export type MemoryMergeProposal = typeof memoryMergeProposals.$inferSelect;
export type NewMemoryMergeProposal = typeof memoryMergeProposals.$inferInsert;

export type MemoryMergeHistory = typeof memoryMergeHistory.$inferSelect;
export type NewMemoryMergeHistory = typeof memoryMergeHistory.$inferInsert;

export type MemoryHashCache = typeof memoryHashCache.$inferSelect;
export type NewMemoryHashCache = typeof memoryHashCache.$inferInsert;

export type MemoryAssociation = typeof memoryAssociations.$inferSelect;
export type NewMemoryAssociation = typeof memoryAssociations.$inferInsert;

export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;

export type MemorySnapshot = typeof memorySnapshots.$inferSelect;
export type NewMemorySnapshot = typeof memorySnapshots.$inferInsert;

export type CoreMemory = typeof coreMemory.$inferSelect;
export type NewCoreMemory = typeof coreMemory.$inferInsert;

export type ContextSession = typeof contextSessions.$inferSelect;
export type NewContextSession = typeof contextSessions.$inferInsert;

// ============================================================================
// v0.10.0: Echo/Fizzle Tracking & Scheduled Maintenance
// ============================================================================

export const memoryFeedback = sqliteTable('memory_feedback', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  memoryId: text('memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  wasInjected: integer('was_injected', { mode: 'boolean' }).default(false),
  wasReferenced: integer('was_referenced', { mode: 'boolean' }).default(false),
  referenceCount: integer('reference_count').default(0),
  retrievalPriorityDelta: integer('retrieval_priority_delta').default(0),
  injectedAt: integer('injected_at', { mode: 'timestamp' }),
  referencedAt: integer('referenced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('memory_feedback_memory_idx').on(table.memoryId),
  index('memory_feedback_session_idx').on(table.sessionId),
  index('memory_feedback_referenced_idx').on(table.wasReferenced),
  index('memory_feedback_conversation_idx').on(table.conversationId),
]);

export const maintenanceJobs = sqliteTable('maintenance_jobs', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  jobName: text('job_name').notNull().unique(),
  jobType: text('job_type').notNull().$type<'nightly' | 'weekly' | 'hourly'>(),
  cronExpression: text('cron_expression'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  lastRunDuration: integer('last_run_duration'),
  lastRunStatus: text('last_run_status').$type<'success' | 'failed' | 'skipped'>(),
  lastRunError: text('last_run_error'),
  totalRuns: integer('total_runs').default(0),
  successCount: integer('success_count').default(0),
  failureCount: integer('failure_count').default(0),
  jobConfig: text('job_config').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('maintenance_jobs_name_idx').on(table.jobName),
  index('maintenance_jobs_next_run_idx').on(table.nextRunAt),
  index('maintenance_jobs_type_idx').on(table.jobType),
  index('maintenance_jobs_enabled_idx').on(table.enabled),
]);

export const maintenanceJobHistory = sqliteTable('maintenance_job_history', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  jobId: text('job_id').notNull().references(() => maintenanceJobs.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  duration: integer('duration'),
  status: text('status').notNull().$type<'success' | 'failed' | 'skipped'>(),
  error: text('error'),
  recordsProcessed: integer('records_processed').default(0),
  resultSummary: text('result_summary').$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('maintenance_job_history_job_idx').on(table.jobId),
  index('maintenance_job_history_started_idx').on(table.startedAt),
  index('maintenance_job_history_status_idx').on(table.status),
]);

export type MemoryFeedback = typeof memoryFeedback.$inferSelect;
export type NewMemoryFeedback = typeof memoryFeedback.$inferInsert;

export type MaintenanceJob = typeof maintenanceJobs.$inferSelect;
export type NewMaintenanceJob = typeof maintenanceJobs.$inferInsert;

export type MaintenanceJobHistory = typeof maintenanceJobHistory.$inferSelect;
export type NewMaintenanceJobHistory = typeof maintenanceJobHistory.$inferInsert;

export type LightweightMemoryIndex = typeof lightweightMemoryIndices.$inferSelect;
export type NewLightweightMemoryIndex = typeof lightweightMemoryIndices.$inferInsert;

export type ContextPagingSession = typeof contextPagingSessions.$inferSelect;
export type NewContextPagingSession = typeof contextPagingSessions.$inferInsert;

// ============================================================================
// Memory Editing Tables (SQLite)
// ============================================================================

export const memoryEditProposals = sqliteTable('memory_edit_proposals', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  memoryId: text('memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  
  currentContent: text('current_content').notNull(),
  proposedContent: text('proposed_content').notNull(),
  
  reason: text('reason').notNull(),
  conflictWarnings: text('conflict_warnings').$type<string[]>(),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'expired'>().default('pending').notNull(),
  
  version: integer('version').default(1).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewNotes: text('review_notes'),
}, (table) => [
  index('memory_edit_proposals_memory_idx').on(table.memoryId),
  index('memory_edit_proposals_status_idx').on(table.status),
  index('memory_edit_proposals_created_at_idx').on(table.createdAt),
]);

export type MemoryEditProposal = typeof memoryEditProposals.$inferSelect;
export type NewMemoryEditProposal = typeof memoryEditProposals.$inferInsert;

export type SearchTrace = typeof searchTraces.$inferSelect;

// ============================================================================
// Phase 3: Retrieval Tracing - Search Traces table
// ============================================================================

/**
 * Search Traces - Stores retrieval logs for debugging and performance analysis
 */
export const searchTraces = sqliteTable('search_traces', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull(),
  query: text('query').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`).notNull(),

  // Search pipeline stages (JSONB stored as text for SQLite)
  queryRewrite: text('query_rewrite').$type<string | null>(),
  candidateRetrieval: text('candidate_retrieval').$type<string | null>(),
  entityFiltering: text('entity_filtering').$type<string | null>(),
  hybridScoring: text('hybrid_scoring').$type<string | null>(),
  reranking: text('reranking').$type<string | null>(),

  // Final results
  resultCount: integer('result_count').default(0),
  topResults: text('top_results').$type<string | null>(),

  // Performance metrics
  totalDurationMs: integer('total_duration_ms').default(0),
  metadata: text('metadata').$type<string | null>(),
}, (table) => [
  index('search_traces_session_idx').on(table.sessionId),
  index('search_traces_timestamp_idx').on(table.timestamp),
]);
