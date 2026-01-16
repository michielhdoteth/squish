import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index, vector, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
// ============================================================================
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
    preferences: jsonb('preferences').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
/**
 * Projects - workspaces that memories are scoped to
 */
export const projects = pgTable('projects', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    path: text('path').notNull(), // Absolute path to project root
    description: text('description'),
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('projects_path_idx').on(table.path),
]);
/**
 * Memories - core memory storage with semantic search
 */
export const memories = pgTable('memories', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Content
    type: text('type').notNull().$type(),
    content: text('content').notNull(),
    summary: text('summary'), // Compressed/summarized version
    // Semantic search
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI ada-002 compatible
    // Metadata
    source: text('source'), // Where this memory came from (tool, hook, user)
    confidence: integer('confidence').default(100), // 0-100 confidence score
    tags: text('tags').array(),
    metadata: jsonb('metadata').$type(),
    // v0.2.0: Privacy and relevance
    isPrivate: boolean('is_private').default(false),
    hasSecrets: boolean('has_secrets').default(false),
    relevanceScore: integer('relevance_score').default(50), // 0-100
    // v0.3.0: Lifecycle Management
    sector: text('sector').default('episodic').$type(),
    tier: text('tier').default('hot').$type(),
    decayRate: integer('decay_rate').default(30), // days until decay
    coactivationScore: integer('coactivation_score').default(0), // 0-100
    lastDecayAt: timestamp('last_decay_at').defaultNow(),
    // v0.3.0: Agent-Aware
    agentId: text('agent_id'), // e.g., 'main', 'research-agent'
    agentRole: text('agent_role'), // e.g., 'general', 'specialist'
    visibilityScope: text('visibility_scope').default('private').$type(),
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
    supersededBy: uuid('superseded_by').references(() => memories.id),
    version: integer('version').default(1),
    // Lifecycle
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'),
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),
    // Merge tracking
    isMerged: boolean('is_merged').default(false), // Soft archive flag
    mergedIntoId: uuid('merged_into_id').references(() => memories.id), // Points to canonical memory
    mergedAt: timestamp('merged_at'),
    isCanonical: boolean('is_canonical').default(false), // True if result of merge
    mergeSourceIds: jsonb('merge_source_ids').$type(), // IDs merged into this one
    isMergeable: boolean('is_mergeable').default(true), // Immutability flag
    mergeVersion: integer('merge_version').default(1), // Incremented on each merge
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
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
]);
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
    metadata: jsonb('metadata').$type(),
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
    role: text('role').notNull().$type(),
    content: text('content').notNull(),
    // Semantic search
    embedding: vector('embedding', { dimensions: 1536 }),
    // Token tracking
    tokenCount: integer('token_count'),
    // Tool usage
    toolCalls: jsonb('tool_calls').$type(),
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('messages_conversation_idx').on(table.conversationId),
    index('messages_role_idx').on(table.role),
    index('messages_created_idx').on(table.createdAt),
]);
/**
 * Observations - auto-captured tool usage and events
 */
export const observations = pgTable('observations', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    // What happened
    type: text('type').notNull().$type(),
    action: text('action').notNull(), // e.g., 'Edit', 'Read', 'Bash'
    target: text('target'), // e.g., file path, command
    // Details
    summary: text('summary').notNull(),
    details: jsonb('details').$type(),
    // Semantic search
    embedding: vector('embedding', { dimensions: 1536 }),
    // v0.2.0: Folder-scoped observations
    folderPath: text('folder_path'),
    projectPath: text('project_path'),
    // v0.2.0: Privacy and relevance
    isPrivate: boolean('is_private').default(false),
    hasSecrets: boolean('has_secrets').default(false),
    relevanceScore: integer('relevance_score').default(50), // 0-100
    // Classification
    category: text('category'), // e.g., 'refactoring', 'debugging', 'feature'
    importance: integer('importance').default(50), // 0-100
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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
 * Entities - knowledge graph nodes
 */
export const entities = pgTable('entities', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().$type(),
    description: text('description'),
    // Semantic search
    embedding: vector('embedding', { dimensions: 1536 }),
    properties: jsonb('properties').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('entities_project_idx').on(table.projectId),
    index('entities_type_idx').on(table.type),
    index('entities_name_idx').on(table.name),
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
    properties: jsonb('properties').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('relations_from_idx').on(table.fromEntityId),
    index('relations_to_idx').on(table.toEntityId),
    index('relations_type_idx').on(table.type),
]);
// ============================================================================
// v0.3.0: Lifecycle & Governance Tables
// ============================================================================
/**
 * Memory Associations - Waypoint graph tracking memory relationships
 */
export const memoryAssociations = pgTable('memory_associations', {
    id: uuid('id').primaryKey().defaultRandom(),
    fromMemoryId: uuid('from_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
    toMemoryId: uuid('to_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
    associationType: text('association_type').notNull().$type(),
    weight: integer('weight').default(1), // Association strength
    coactivationCount: integer('coactivation_count').default(0),
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastCoactivatedAt: timestamp('last_coactivated_at'),
}, (table) => [
    index('associations_from_idx').on(table.fromMemoryId),
    index('associations_to_idx').on(table.toMemoryId),
    index('associations_type_idx').on(table.associationType),
    index('associations_weight_idx').on(table.weight),
]);
/**
 * Session Summaries - Compressed conversation snapshots
 */
export const sessionSummaries = pgTable('session_summaries', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    summaryType: text('summary_type').notNull().$type(),
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
    snapshotType: text('snapshot_type').notNull().$type(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type(),
    diff: jsonb('diff').$type(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('snapshots_memory_idx').on(table.memoryId),
    index('snapshots_type_idx').on(table.snapshotType),
    index('snapshots_created_idx').on(table.createdAt),
]);
// ============================================================================
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
    sourceMemoryIds: jsonb('source_memory_ids').$type().notNull(),
    // Proposed merged content
    proposedContent: text('proposed_content').notNull(),
    proposedSummary: text('proposed_summary'),
    proposedTags: jsonb('proposed_tags').$type(),
    proposedMetadata: jsonb('proposed_metadata').$type(),
    // Detection metadata
    detectionMethod: text('detection_method').notNull().$type(),
    similarityScore: numeric('similarity_score').notNull(), // 0-1
    confidenceLevel: text('confidence_level').notNull().$type(),
    // Merge rationale
    mergeReason: text('merge_reason').notNull(),
    conflictWarnings: jsonb('conflict_warnings').$type(),
    // Status
    status: text('status').notNull().$type().default('pending'),
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
    sourceMemoryIds: jsonb('source_memory_ids').$type().notNull(),
    canonicalMemoryId: uuid('canonical_memory_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
    // Snapshot of merged memories (for reversibility)
    sourceMemoriesSnapshot: jsonb('source_memories_snapshot').$type().notNull(),
    // Merge metadata
    mergeStrategy: text('merge_strategy').notNull().$type(),
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
    minhash: jsonb('minhash').$type(), // Array of 128 hash values
    // Metadata for cache invalidation
    contentHash: text('content_hash').notNull(), // MD5/SHA of content for invalidation
    lastUpdated: timestamp('last_updated').defaultNow().notNull(),
}, (table) => [
    index('memory_hash_cache_project_id_idx').on(table.projectId),
    index('memory_hash_cache_simhash_idx').on(table.simhash), // For Hamming distance queries
]);
// ============================================================================
// Relations (Drizzle ORM)
// ============================================================================
export const usersRelations = relations(users, ({ many }) => ({
    memories: many(memories),
    conversations: many(conversations),
}));
export const projectsRelations = relations(projects, ({ many }) => ({
    memories: many(memories),
    conversations: many(conversations),
    observations: many(observations),
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
    observations: many(observations),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
}));
export const observationsRelations = relations(observations, ({ one }) => ({
    project: one(projects, {
        fields: [observations.projectId],
        references: [projects.id],
    }),
    conversation: one(conversations, {
        fields: [observations.conversationId],
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
//# sourceMappingURL=schema.js.map