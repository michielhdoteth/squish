import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index, vector, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Type Definitions
// ============================================================================

export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference' | 'reflection' | 'note';

// Core Tables
// ============================================================================

/**
 * Users - represents Claude Code users
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').unique(), // Claude user ID if available
  name: text('name'),
  email: text('email'),
  preferences: jsonb('preferences').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Memory Editing Tables
// ============================================================================

/**
 * Memory Edit Proposals - tracks suggested edits before user approval
 */
export const memoryEditProposals = pgTable('memory_edit_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Memory to edit
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  
  // Current content
  currentContent: text('current_content').notNull(),
  proposedContent: text('proposed_content').notNull(),
  
  // Edit metadata
  reason: text('reason').notNull(),
  conflictWarnings: jsonb('conflict_warnings').$type<string[]>(),
  status: text('status').notNull().$type<'pending' | 'approved' | 'rejected' | 'expired'>().default('pending'),
  
  // Versioning
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),
}, (table) => [
  index('memory_edit_proposals_memory_idx').on(table.memoryId),
  index('memory_edit_proposals_status_idx').on(table.status),
  index('memory_edit_proposals_created_at_idx').on(table.createdAt),
]);

/**
 * Core Memory - Always-in-context memory (Tier 1)
 * Small, persistent, always-visible memory block (< 2KB total)
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  path: text('path').notNull(), // Absolute path to project root
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('projects_path_idx').on(table.path),
]);

/**
 * Memories - core memory storage with semantic search
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Content
    type: text('type').notNull().$type<'observation' | 'fact' | 'decision' | 'context' | 'preference'>(),
    content: text('content').notNull(),
    summary: text('summary'), // Compressed/summarized version

    // Semantic search
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI ada-002 compatible

	// Metadata
	source: text('source'), // Where this memory came from (tool, hook, user)
	confidence: integer('confidence').default(50), // 0-100 confidence score (default: speculative)
	confidenceLevel: text('confidence_level').default('speculative').$type<'certain' | 'speculative' | 'outdated'>(), // Iteration 3: Confidence flags (default: speculative)
	tags: text('tags').array(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // v0.2.0: Privacy and relevance
    isPrivate: boolean('is_private').default(false),
    hasSecrets: boolean('has_secrets').default(false),
    relevanceScore: integer('relevance_score').default(50), // 0-100

// v0.3.0: Lifecycle Management
  sector: text('sector').default('episodic').$type<'episodic' | 'semantic' | 'procedural' | 'autobiographical' | 'working'>(),
  tier: text('tier').default('hot').$type<'hot' | 'warm' | 'cold'>(),
  status: text('status').notNull().default('active'),
  encrypted_content: text('encrypted_content'),
  encryption_nonce: text('encryption_nonce'),
  is_encrypted: boolean('is_encrypted').default(false),
  // Per-memory decay rate (integer percentage, e.g., 30 = 30% decay per cycle)
  decayRate: integer('decay_rate').default(30),
    coactivationScore: integer('coactivation_score').default(0), // 0-100
    lastDecayAt: timestamp('last_decay_at').defaultNow(),

    // v0.3.0: Agent-Aware
    agentId: text('agent_id'), // e.g., 'main', 'research-agent'
    agentRole: text('agent_role'), // e.g., 'general', 'specialist'
    visibilityScope: text('visibility_scope').default('private').$type<'private' | 'project' | 'team' | 'global'>(),

    // v0.3.0: Governance
    isProtected: boolean('is_protected').default(false), // Cannot be evicted
    isPinned: boolean('is_pinned').default(false), // Always inject
    isImmutable: boolean('is_immutable').default(false), // Cannot be updated
    writeScope: text('write_scope').array(), // Who can modify
    readScope: text('read_scope').array(), // Who can read

    // v0.3.0: Provenance
    triggeredBy: text('triggered_by'), // What triggered this memory
    captureReason: text('capture_reason'), // Why was this remembered
    lastUsedAt: timestamp('last_used_at'),
    usageCount: integer('usage_count').default(0),

    // v0.3.0: Temporal Facts
    validFrom: timestamp('valid_from'),
    validTo: timestamp('valid_to'),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(), // When agent learned/stored the fact
    supersededBy: uuid('superseded_by').references((): any => (memories as any).id),
    version: integer('version').default(1),

    // Lifecycle
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'),
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),

    // Merge tracking
    isMerged: boolean('is_merged').default(false), // Soft archive flag
    mergedIntoId: uuid('merged_into_id').references((): any => (memories as any).id), // Points to canonical memory
    mergedAt: timestamp('merged_at'),
    isCanonical: boolean('is_canonical').default(false), // True if result of merge
    mergeSourceIds: jsonb('merge_source_ids').$type<string[]>(), // IDs merged into this one
    isMergeable: boolean('is_mergeable').default(true), // Immutability flag
    mergeVersion: integer('merge_version').default(1), // Incremented on each merge

    // v0.4.2: Namespace support
    namespaceId: uuid('namespace_id').references(() => namespaces.id, { onDelete: 'set null' }),
    namespacePath: text('namespace_path'),

    // v1.1.5: Places support (spatial memory organization)
    placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
    placeSortOrder: integer('place_sort_order'),

    // v0.4.3: Layer support
    hasL0Abstract: boolean('has_l0_abstract').default(false),
    hasL1Overview: boolean('has_l1_overview').default(false),
    lastLayerUpdate: timestamp('last_layer_update'),

    // v1.0.x: Token tracking
    tokensEstimate: integer('tokens_estimate').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
    // v0.3.0: Lifecycle indexes
    index('memories_sector_idx').on(table.sector),
    index('memories_tier_idx').on(table.tier),
    index('memories_agent_idx').on(table.agentId),
    index('memories_visibility_idx').on(table.visibilityScope),
    index('memories_protected_idx').on(table.isProtected),
    index('memories_pinned_idx').on(table.isPinned),
    index('memories_valid_from_idx').on(table.validFrom),
    index('memories_valid_to_idx').on(table.validTo),

    // v0.4.2: Composite indexes for performance optimization
    // Duplicate detection query optimization
    index('memories_duplicate_detection_idx').on(
      table.projectId,
      table.isMerged,
      table.isMergeable,
      table.isActive
    ),
    // Eviction query optimization (lifecycle.ts line 170-183)
    index('memories_eviction_idx').on(
      table.projectId,
      table.tier,
      table.relevanceScore,
      table.createdAt
    ),
    // Decay operations optimization (lifecycle.ts line 70-100)
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
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  sessionId: text('session_id').notNull(), // Claude session ID
  title: text('title'),
  summary: text('summary'),

  // Stats
  messageCount: integer('message_count').default(0),
  tokenCount: integer('token_count').default(0),

  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('conversations_project_idx').on(table.projectId),
  index('conversations_session_idx').on(table.sessionId),
  index('conversations_started_idx').on(table.startedAt),
]);

/**
 * Messages - individual messages within conversations
 */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),

  role: text('role').notNull().$type<'user' | 'assistant' | 'system'>(),
  content: text('content').notNull(),

  // Semantic search
  embedding: vector('embedding', { dimensions: 1536 }),

  // Token tracking
  tokenCount: integer('token_count'),

  // Tool usage
  toolCalls: jsonb('tool_calls').$type<Array<{ name: string; args: unknown; result?: unknown }>>(),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('messages_conversation_idx').on(table.conversationId),
  index('messages_role_idx').on(table.role),
  index('messages_created_idx').on(table.createdAt),
]);

/**
 * Learnings - agent learnings: success, failure, fix, insight
 */
export const learnings = pgTable('learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),

  // Learning type: success, failure, fix, insight
  type: text('type').notNull().$type<'success' | 'failure' | 'fix' | 'insight'>(),
  action: text('action').notNull(),
  target: text('target'),

  // Details
  summary: text('summary').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),

  // Semantic search
  embedding: vector('embedding', { dimensions: 1536 }),

  // Optional link to a memory
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'set null' }),

  // Folder-scoped
  folderPath: text('folder_path'),
  projectPath: text('project_path'),

  // Privacy and relevance
  isPrivate: boolean('is_private').default(false),
  hasSecrets: boolean('has_secrets').default(false),
  relevanceScore: integer('relevance_score').default(50),

  // Classification
  category: text('category'),
  importance: integer('importance').default(50),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  // Migration tracking
  isImported: boolean('is_imported').default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('learnings_project_idx').on(table.projectId),
  index('learnings_type_idx').on(table.type),
  index('learnings_action_idx').on(table.action),
  index('learnings_created_idx').on(table.createdAt),
  index('learnings_folder_idx').on(table.folderPath),
  index('learnings_relevance_idx').on(table.relevanceScore),
  index('learnings_private_idx').on(table.isPrivate),
  index('learnings_memory_idx').on(table.memoryId),
]);

/**
 * Agent Preferences - learned agent preferences from learnings
 * Enables agents to evolve and remember preferences over time
 */
export const agentPreferences = pgTable('agent_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  key: text('key').notNull(),  // e.g., "prefer_bun", "prefer_typescript"
  value: text('value').notNull(),  // e.g., "bun", "true"
  
  sourceMemoryId: uuid('source_memory_id').references(() => memories.id, { onDelete: 'set null' }),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0.5'),  // 0.00 to 1.00
  usageCount: integer('usage_count').default(1),
  
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('agent_preferences_project_idx').on(table.projectId),
  index('agent_preferences_key_idx').on(table.key),
]);

/**
 * Entities - knowledge graph nodes
 */
export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  type: text('type').notNull().$type<'person' | 'file' | 'function' | 'class' | 'concept' | 'tool' | 'other'>(),
  description: text('description'),

  // Semantic search
  embedding: vector('embedding', { dimensions: 1536 }),

  properties: jsonb('properties').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('entities_project_idx').on(table.projectId),
  index('entities_type_idx').on(table.type),
  index('entities_name_idx').on(table.name),
]);

/**
 * Namespaces - Hierarchical folder-like namespaces for memory organization
 */
export const namespaces: any = pgTable('namespaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),

  name: text('name').notNull(),
  parentId: uuid('parent_id').references(() => namespaces.id, { onDelete: 'set null' }),
  type: text('type').notNull().$type<'root' | 'user' | 'agent' | 'project' | 'custom'>(),
  description: text('description'),

  path: text('path').notNull(), // Full path like 'user/preferences' or 'projectX/docs/api'

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('namespaces_project_idx').on(table.projectId),
  index('namespaces_parent_idx').on(table.parentId),
]);

/**
 * Places - Spatial memory organization (Method of Loci)
 */
export const places: any = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  placeType: text('place_type').notNull(),
  parentId: uuid('parent_id').references(() => places.id, { onDelete: 'set null' }),
  
  sortOrder: integer('sort_order').default(0),
  positionX: integer('position_x').default(0),
  positionY: integer('position_y').default(0),
  description: text('description'),
  purpose: text('purpose'),
  memoryCount: integer('memory_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('places_project_idx').on(table.projectId),
  index('places_type_idx').on(table.placeType),
  index('places_parent_idx').on(table.parentId),
  index('places_sort_order_idx').on(table.projectId, table.sortOrder),
]);

/**
 * Memory-Place assignments
 */
export const memoryPlaces: any = pgTable('memory_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  placeId: uuid('place_id').references(() => places.id, { onDelete: 'cascade' }).notNull(),
  isManual: boolean('is_manual').default(false),
  ruleId: uuid('rule_id'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('memory_places_memory_idx').on(table.memoryId),
  index('memory_places_place_idx').on(table.placeId),
]);

/**
 * Place auto-assignment rules
 */
export const placeRules: any = pgTable('place_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  placeType: text('place_type').notNull(),
  
  matchTool: text('match_tool'),
  matchKeyword: text('match_keyword'),
  matchTag: text('match_tag'),
  matchMemoryType: text('match_memory_type'),
  
  priority: integer('priority').default(0),
  enabled: boolean('enabled').default(true),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('place_rules_project_idx').on(table.projectId),
  index('place_rules_type_idx').on(table.placeType),
]);

/**
 * Memory Layers - Tiered L0/L1/L2 summaries for token-efficient retrieval
 */
export const memoryLayers = pgTable('memory_layers', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),

  layerType: text('layer_type').notNull().$type<'l0_abstract' | 'l1_overview' | 'l2_full'>(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').default(0),
  embedding: vector('embedding', { dimensions: 1536 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('memory_layers_memory_idx').on(table.memoryId),
  index('memory_layers_type_idx').on(table.layerType),
]);

/**
 * Relations - knowledge graph edges
 */
export const entityRelations = pgTable('entity_relations', {
  id: uuid('id').primaryKey().defaultRandom(),

  fromEntityId: uuid('from_entity_id').references(() => entities.id, { onDelete: 'cascade' }).notNull(),
  toEntityId: uuid('to_entity_id').references(() => entities.id, { onDelete: 'cascade' }).notNull(),

  type: text('type').notNull(), // e.g., 'uses', 'extends', 'contains', 'depends_on'
  weight: integer('weight').default(1),

  properties: jsonb('properties').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('relations_from_idx').on(table.fromEntityId),
  index('relations_to_idx').on(table.toEntityId),
  index('relations_type_idx').on(table.type),
]);

// v0.3.0: Lifecycle & Governance Tables
// ============================================================================

/**
 * Memory Associations - Waypoint graph tracking memory relationships
 */
export const memoryAssociations = pgTable('memory_associations', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromMemoryId: uuid('from_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  toMemoryId: uuid('to_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),

  associationType: text('association_type').notNull().$type<'co_occurred' | 'supersedes' | 'contradicts' | 'supports' | 'relates_to'>(),
  weight: integer('weight').default(1), // Association strength
  coactivationCount: integer('coactivation_count').default(0),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastCoactivatedAt: timestamp('last_coactivated_at'),
}, (table) => [
  index('associations_from_idx').on(table.fromMemoryId),
  index('associations_to_idx').on(table.toMemoryId),
  index('associations_type_idx').on(table.associationType),
  index('associations_weight_idx').on(table.weight),
  // v0.4.2: Composite index for graph traversal optimization
  index('associations_graph_traversal_idx').on(
    table.fromMemoryId,
    table.toMemoryId,
    table.weight,
    table.associationType
  ),
]);

/**
 * Session Summaries - Compressed conversation snapshots
 */
export const sessionSummaries = pgTable('session_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  summaryType: text('summary_type').notNull().$type<'incremental' | 'rolling' | 'final'>(),
  content: text('content').notNull(),
  compressedFrom: integer('compressed_from'), // How many messages compressed
  tokensSaved: integer('tokens_saved'),

  embedding: vector('embedding', { dimensions: 1536 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('session_summaries_conversation_idx').on(table.conversationId),
  index('session_summaries_project_idx').on(table.projectId),
  index('session_summaries_type_idx').on(table.summaryType),
]);

/**
 * Memory Snapshots - Before/after diffs for auditability
 */
export const memorySnapshots = pgTable('memory_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),

  snapshotType: text('snapshot_type').notNull().$type<'before_update' | 'after_update' | 'periodic'>(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  diff: jsonb('diff').$type<{ added?: string[]; removed?: string[]; changed?: Record<string, { from: unknown; to: unknown }> }>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('snapshots_memory_idx').on(table.memoryId),
  index('snapshots_type_idx').on(table.snapshotType),
  index('snapshots_created_idx').on(table.createdAt),
]);

// Progressive Disclosure & Context Paging Tables
// ============================================================================

/**
 * Lightweight memory indices for progressive disclosure - previews and metadata
 * used for quick filtering before loading full memories
 */
export const lightweightMemoryIndices = pgTable('lightweight_memory_indices', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }),
  
  // Hash for quick comparison
  contentHash: text('content_hash').notNull(),
  contentPreview: text('content_preview').notNull(),
  keyTerms: text('key_terms').array(), // JSON array of keywords
  
  // Categorization
  category: text('category').notNull(),
  importanceScore: integer('importance_score').notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('lightweight_indices_memory_idx').on(table.memoryId),
  index('lightweight_indices_category_idx').on(table.category),
  index('lightweight_indices_importance_idx').on(table.importanceScore),
]);

/**
 * Context paging sessions for tracking loaded/preloaded memories
 * Agent-controlled memory loading system
 */
export const contextPagingSessions = pgTable('context_paging_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull().unique(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Loaded memories (actively in context)
  loadedMemoryIds: text('loaded_memory_ids').array().default([]),
  
  // Preload candidates (ready to load if needed)
  preloadCandidateIds: text('preload_candidate_ids').array().default([]),
  
  // Token tracking
  tokenBudget: integer('token_budget').default(8000).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  loadedMemoriesTokens: integer('loaded_memories_tokens').default(0).notNull(),
  
  // Session metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('context_paging_session_idx').on(table.sessionId),
  index('context_paging_project_idx').on(table.projectId),
  index('context_paging_created_idx').on(table.createdAt),
]);

// Memory Merging Tables
// ============================================================================

/**
 * Memory Merge Proposals - tracks suggested merges before user approval
 */
export const memoryMergeProposals = pgTable('memory_merge_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Source memories to be merged
  sourceMemoryIds: jsonb('source_memory_ids').$type<string[]>().notNull(),

  // Proposed merged content
  proposedContent: text('proposed_content').notNull(),
  proposedSummary: text('proposed_summary'),
  proposedTags: jsonb('proposed_tags').$type<string[]>(),
  proposedMetadata: jsonb('proposed_metadata').$type<Record<string, unknown>>(),

  // Detection metadata
  detectionMethod: text('detection_method').notNull().$type<'simhash' | 'minhash' | 'embedding'>(),
  similarityScore: numeric('similarity_score').notNull(), // 0-1
  confidenceLevel: text('confidence_level').notNull().$type<'high' | 'medium' | 'low'>(),

  // Merge rationale
  mergeReason: text('merge_reason').notNull(),
  conflictWarnings: jsonb('conflict_warnings').$type<string[]>(),

  // Status
  status: text('status').notNull().$type<'pending' | 'approved' | 'rejected' | 'expired'>().default('pending'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNotes: text('review_notes'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'), // Auto-expire old proposals
}, (table) => [
  index('memory_merge_proposals_project_status_idx').on(table.projectId, table.status),
  index('memory_merge_proposals_created_at_idx').on(table.createdAt),
]);

/**
 * Memory Merge History - audit trail of completed merges
 */
export const memoryMergeHistory = pgTable('memory_merge_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Merge details
  proposalId: uuid('proposal_id').references(() => memoryMergeProposals.id, { onDelete: 'set null' }),
  sourceMemoryIds: jsonb('source_memory_ids').$type<string[]>().notNull(),
  canonicalMemoryId: uuid('canonical_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),

  // Snapshot of merged memories (for reversibility)
  sourceMemoriesSnapshot: jsonb('source_memories_snapshot').$type<Record<string, unknown>[]>().notNull(),

  // Merge metadata
  mergeStrategy: text('merge_strategy').notNull().$type<'union' | 'latest' | 'voting' | 'custom'>(),
  tokensSaved: integer('tokens_saved'), // Estimated context window savings

  // Reversibility
  isReversed: boolean('is_reversed').default(false),
  reversedAt: timestamp('reversed_at'),
  reversedBy: uuid('reversed_by'),

  // Timestamps
  mergedAt: timestamp('merged_at').defaultNow().notNull(),
});

/**
 * Memory Hash Cache - cached hash signatures for efficient duplicate detection
 */
export const memoryHashCache = pgTable('memory_hash_cache', {
  memoryId: uuid('memory_id').primaryKey().references(() => memories.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),

  // Hash signatures
  simhash: text('simhash'), // 64-bit hash as hex string
  minhash: jsonb('minhash').$type<number[]>(), // Array of 128 hash values

  // Metadata for cache invalidation
  contentHash: text('content_hash').notNull(), // MD5/SHA of content for invalidation
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
}, (table) => [
  index('memory_hash_cache_project_id_idx').on(table.projectId),
  index('memory_hash_cache_simhash_idx').on(table.simhash), // For Hamming distance queries
]);

/**
 * Search Traces - Stores retrieval logs for debugging and performance analysis
 */
export const searchTraces = pgTable('search_traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull(),
  query: text('query').notNull(),
  timestamp: timestamp('timestamp_at').defaultNow(),

  // Search pipeline stages (JSONB for flexibility)
  queryRewrite: jsonb('query_rewrite'), // { original, rewritten, method }
  candidateRetrieval: jsonb('candidate_retrieval'), // { candidates, timeMs }
  entityFiltering: jsonb('entity_filtering'), // { entities: string[], results: timeMs }
  hybridScoring: jsonb('hybrid_scoring'), // { results, timeMs }
  reranking: jsonb('reranking'), // { results, timeMs }

  // Final results
  resultCount: integer('result_count').default(0),
  topResults: jsonb('top_results'),

  // Performance metrics
  totalDurationMs: integer('total_duration_ms').default(0),
  metadata: jsonb('metadata'),
}, (table) => [
  index('search_traces_session_idx').on(table.sessionId),
  index('search_traces_timestamp_idx').on(table.timestamp),
]);

/**
 * Core Memory - Always-in-context memory (Tier 1)
 * Small, persistent, always-visible memory block (< 2KB total)
 */
export const coreMemory = pgTable('core_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

   // Core memory sections
   section: text('section').notNull().$type<'persona' | 'user_info' | 'project_context' | 'working_notes'>(),
   content: text('content').notNull().default(''),
   sizeBytes: integer('size_bytes').default(0).notNull(),
   tokensEstimate: integer('tokens_estimate').default(0).notNull(),

   // Version tracking
   version: integer('version').default(1).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('core_memory_project_idx').on(table.projectId),
  index('core_memory_user_idx').on(table.userId),
  index('core_memory_section_idx').on(table.section),
]);

/**
 * Context Sessions - Track loaded memories and context window usage
 */
export const contextSessions = pgTable('context_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull().unique(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Loaded memories (paging system)
  loadedMemoryIds: text('loaded_memory_ids').array().default([]),

  // Token tracking
  tokenBudget: integer('token_budget').default(8000).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  coreMemoryTokens: integer('core_memory_tokens').default(0).notNull(),
  loadedMemoriesTokens: integer('loaded_memories_tokens').default(0).notNull(),

  // Session metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('context_sessions_session_idx').on(table.sessionId),
  index('context_sessions_project_idx').on(table.projectId),
  index('context_sessions_created_idx').on(table.createdAt),
]);

// Relations (Drizzle ORM)
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  memories: many(memories),
  conversations: many(conversations),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  memories: many(memories),
  conversations: many(conversations),
  learnings: many(learnings),
  entities: many(entities),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  project: one(projects, {
    fields: [memories.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [memories.userId],
    references: [users.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  project: one(projects, {
    fields: [conversations.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
  learnings: many(learnings),
}));

export const learningsRelations = relations(learnings, ({ one }) => ({
  project: one(projects, {
    fields: [learnings.projectId],
    references: [projects.id],
  }),
  conversation: one(conversations, {
    fields: [learnings.conversationId],
    references: [conversations.id],
  }),
  memory: one(memories, {
    fields: [learnings.memoryId],
    references: [memories.id],
  }),
}));

export const agentPreferencesRelations = relations(agentPreferences, ({ one }) => ({
  project: one(projects, {
    fields: [agentPreferences.projectId],
    references: [projects.id],
  }),
  sourceMemory: one(memories, {
    fields: [agentPreferences.sourceMemoryId],
    references: [memories.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, {
    fields: [entities.projectId],
    references: [projects.id],
  }),
  outgoingRelations: many(entityRelations, { relationName: 'fromEntity' }),
  incomingRelations: many(entityRelations, { relationName: 'toEntity' }),
}));

export const entityRelationsRelations = relations(entityRelations, ({ one }) => ({
  fromEntity: one(entities, {
    fields: [entityRelations.fromEntityId],
    references: [entities.id],
    relationName: 'fromEntity',
  }),
  toEntity: one(entities, {
    fields: [entityRelations.toEntityId],
    references: [entities.id],
    relationName: 'toEntity',
  }),
}));

export const memoryAssociationsRelations = relations(memoryAssociations, ({ one }) => ({
  fromMemory: one(memories, {
    fields: [memoryAssociations.fromMemoryId],
    references: [memories.id],
    relationName: 'fromAssociations',
  }),
  toMemory: one(memories, {
    fields: [memoryAssociations.toMemoryId],
    references: [memories.id],
    relationName: 'toAssociations',
  }),
}));

export const sessionSummariesRelations = relations(sessionSummaries, ({ one }) => ({
  conversation: one(conversations, {
    fields: [sessionSummaries.conversationId],
    references: [conversations.id],
  }),
  project: one(projects, {
    fields: [sessionSummaries.projectId],
    references: [projects.id],
  }),
}));

export const memorySnapshotsRelations = relations(memorySnapshots, ({ one }) => ({
  memory: one(memories, {
    fields: [memorySnapshots.memoryId],
    references: [memories.id],
  }),
}));

export const memoryMergeProposalsRelations = relations(memoryMergeProposals, ({ one }) => ({
  project: one(projects, {
    fields: [memoryMergeProposals.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [memoryMergeProposals.userId],
    references: [users.id],
  }),
}));

export const memoryMergeHistoryRelations = relations(memoryMergeHistory, ({ one }) => ({
  project: one(projects, {
    fields: [memoryMergeHistory.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [memoryMergeHistory.userId],
    references: [users.id],
  }),
  canonicalMemory: one(memories, {
    fields: [memoryMergeHistory.canonicalMemoryId],
    references: [memories.id],
  }),
  proposal: one(memoryMergeProposals, {
    fields: [memoryMergeHistory.proposalId],
    references: [memoryMergeProposals.id],
  }),
}));

export const memoryHashCacheRelations = relations(memoryHashCache, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryHashCache.memoryId],
    references: [memories.id],
  }),
  project: one(projects, {
    fields: [memoryHashCache.projectId],
    references: [projects.id],
  }),
}));

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

export type Learning = typeof learnings.$inferSelect;
export type NewLearning = typeof learnings.$inferInsert;

export type AgentPreference = typeof agentPreferences.$inferSelect;
export type NewAgentPreference = typeof agentPreferences.$inferInsert;

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



export type LightweightMemoryIndex = typeof lightweightMemoryIndices.$inferSelect;
export type NewLightweightMemoryIndex = typeof lightweightMemoryIndices.$inferInsert;

export type ContextPagingSession = typeof contextPagingSessions.$inferSelect;
export type MemoryEditProposal = typeof memoryEditProposals.$inferSelect;
export type NewMemoryEditProposal = typeof memoryEditProposals.$inferInsert;


export type CoreMemory = typeof coreMemory.$inferSelect;
export type NewCoreMemory = typeof coreMemory.$inferInsert;

export type ContextSession = typeof contextSessions.$inferSelect;
export type NewContextSession = typeof contextSessions.$inferInsert;
