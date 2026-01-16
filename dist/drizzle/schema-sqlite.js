import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';
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
    preferences: text('preferences').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
});
/**
 * Projects - workspaces that memories are scoped to
 */
export const projects = sqliteTable('projects', {
    id: text('id').primaryKey().$default(() => crypto.randomUUID()),
    name: text('name').notNull(),
    path: text('path').notNull(),
    description: text('description'),
    metadata: text('metadata').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index('projects_path_idx').on(table.path),
]);
/**
 * Memories - core memory storage
 */
export const memories = sqliteTable('memories', {
    id: text('id').primaryKey().$default(() => crypto.randomUUID()),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Content
    type: text('type').notNull().$type(),
    content: text('content').notNull(),
    summary: text('summary'),
    // Embeddings stored as JSON string (not for semantic search in SQLite)
    embeddingJson: text('embedding_json'),
    // v0.2.0: Vector embedding for local search
    embedding: blob('embedding'),
    // Metadata
    source: text('source'),
    confidence: integer('confidence').default(100),
    tags: text('tags').$type(),
    metadata: text('metadata').$type(),
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
    mergedIntoId: text('merged_into_id').references(() => memories.id),
    mergedAt: integer('merged_at', { mode: 'timestamp' }),
    isCanonical: integer('is_canonical', { mode: 'boolean' }).default(false),
    mergeSourceIds: text('merge_source_ids').$type(),
    isMergeable: integer('is_mergeable', { mode: 'boolean' }).default(true),
    mergeVersion: integer('merge_version').default(1),
    // v0.3.0: Memory Lifecycle Management
    sector: text('sector').$type().default('episodic'),
    tier: text('tier').$type().default('hot'),
    decayRate: integer('decay_rate').default(30),
    coactivationScore: integer('coactivation_score').default(0),
    lastDecayAt: integer('last_decay_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`),
    // v0.3.0: Agent-Aware Memory
    agentId: text('agent_id'),
    agentRole: text('agent_role'),
    visibilityScope: text('visibility_scope').$type().default('private'),
    // v0.3.0: Memory Governance
    isProtected: integer('is_protected', { mode: 'boolean' }).default(false),
    isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
    isImmutable: integer('is_immutable', { mode: 'boolean' }).default(false),
    writeScope: text('write_scope').$type(),
    readScope: text('read_scope').$type(),
    // v0.3.0: Provenance
    triggeredBy: text('triggered_by'),
    captureReason: text('capture_reason'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    usageCount: integer('usage_count').default(0),
    // v0.3.0: Temporal Facts
    validFrom: integer('valid_from', { mode: 'timestamp' }),
    validTo: integer('valid_to', { mode: 'timestamp' }),
    supersededBy: text('superseded_by').references(() => memories.id),
    version: integer('version').default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
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
]);
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
    startedAt: integer('started_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
    metadata: text('metadata').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    role: text('role').notNull().$type(),
    content: text('content').notNull(),
    embeddingJson: text('embedding_json'),
    tokenCount: integer('token_count'),
    toolCalls: text('tool_calls').$type(),
    metadata: text('metadata').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    details: text('details').$type(),
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
    metadata: text('metadata').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    properties: text('properties').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index('entities_project_idx').on(table.projectId),
    index('entities_type_idx').on(table.type),
    index('entities_name_idx').on(table.name),
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
    sourceMemoryIds: text('source_memory_ids').$type().notNull(),
    proposedContent: text('proposed_content').notNull(),
    proposedSummary: text('proposed_summary'),
    proposedTags: text('proposed_tags').$type(),
    proposedMetadata: text('proposed_metadata').$type(),
    detectionMethod: text('detection_method').notNull().$type(),
    similarityScore: text('similarity_score').notNull(),
    confidenceLevel: text('confidence_level').notNull().$type(),
    mergeReason: text('merge_reason').notNull(),
    conflictWarnings: text('conflict_warnings').$type(),
    status: text('status').$type().default('pending').notNull(),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewNotes: text('review_notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    sourceMemoryIds: text('source_memory_ids').$type().notNull(),
    canonicalMemoryId: text('canonical_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
    sourceMemoriesSnapshot: text('source_memories_snapshot').$type().notNull(),
    mergeStrategy: text('merge_strategy').notNull().$type(),
    tokensSaved: integer('tokens_saved'),
    isReversed: integer('is_reversed', { mode: 'boolean' }).default(false),
    reversedAt: integer('reversed_at', { mode: 'timestamp' }),
    reversedBy: text('reversed_by'),
    mergedAt: integer('merged_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
});
/**
 * Memory Hash Cache - cached hash signatures for efficient duplicate detection
 */
export const memoryHashCache = sqliteTable('memory_hash_cache', {
    memoryId: text('memory_id').primaryKey().references(() => memories.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    simhash: text('simhash'),
    minhash: text('minhash').$type(),
    contentHash: text('content_hash').notNull(),
    lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    properties: text('properties').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    associationType: text('association_type').notNull().$type(),
    weight: integer('weight').default(1),
    coactivationCount: integer('coactivation_count').default(0),
    metadata: text('metadata').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    lastCoactivatedAt: integer('last_coactivated_at', { mode: 'timestamp' }),
}, (table) => [
    index('memory_associations_from_idx').on(table.fromMemoryId),
    index('memory_associations_to_idx').on(table.toMemoryId),
    index('memory_associations_type_idx').on(table.associationType),
    index('memory_associations_weight_idx').on(table.weight),
]);
/**
 * Session Summaries - incremental and rolling session summaries
 */
export const sessionSummaries = sqliteTable('session_summaries', {
    id: text('id').primaryKey().$default(() => crypto.randomUUID()),
    conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    summaryType: text('summary_type').notNull().$type(),
    content: text('content').notNull(),
    compressedFrom: integer('compressed_from'),
    tokensSaved: integer('tokens_saved'),
    embedding: blob('embedding'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
    snapshotType: text('snapshot_type').notNull().$type(),
    content: text('content').notNull(),
    metadata: text('metadata').$type(),
    diff: text('diff').$type(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index('memory_snapshots_memory_idx').on(table.memoryId),
    index('memory_snapshots_type_idx').on(table.snapshotType),
    index('memory_snapshots_created_idx').on(table.createdAt),
]);
//# sourceMappingURL=schema-sqlite.js.map