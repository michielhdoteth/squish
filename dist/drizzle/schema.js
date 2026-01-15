import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index, vector } from 'drizzle-orm/pg-core';
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
    // Lifecycle
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'),
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('memories_project_idx').on(table.projectId),
    index('memories_type_idx').on(table.type),
    index('memories_created_idx').on(table.createdAt),
    index('memories_tags_idx').on(table.tags),
    index('memories_relevance_idx').on(table.relevanceScore),
    index('memories_private_idx').on(table.isPrivate),
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
//# sourceMappingURL=schema.js.map