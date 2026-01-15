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
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql `CURRENT_TIMESTAMP`).notNull(),
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
//# sourceMappingURL=schema-sqlite.js.map