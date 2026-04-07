/**
 * Schema Index - Aggregates all table definitions
 * 
 * This module exports all table schemas for both SQLite and PostgreSQL.
 * Used by bootstrap.ts to generate database schemas.
 */

export { usersTable } from './tables/users.js';
export { projectsTable } from './tables/projects.js';
export { memoriesTable } from './tables/memories.js';
export { memoryAssociationsTable } from './tables/memory-associations.js';
export { conversationsTable } from './tables/conversations.js';
export { messagesTable } from './tables/messages.js';
export { observationsTable } from './tables/observations.js';
export { entitiesTable } from './tables/entities.js';
export { entityRelationsTable } from './tables/entity-relations.js';
export { contextSessionsTable } from './tables/context-sessions.js';
export { coreMemoryTable } from './tables/core-memory.js';
export { memoryHashCacheTable } from './tables/memory-hash-cache.js';
export { memoryMergeProposalsTable } from './tables/memory-merge-proposals.js';
export { memoryMergeHistoryTable } from './tables/memory-merge-history.js';
export { namespacesTable } from './tables/namespaces.js';

import { usersTable } from './tables/users.js';
import { projectsTable } from './tables/projects.js';
import { memoriesTable } from './tables/memories.js';
import { memoryAssociationsTable } from './tables/memory-associations.js';
import { conversationsTable } from './tables/conversations.js';
import { messagesTable } from './tables/messages.js';
import { observationsTable } from './tables/observations.js';
import { entitiesTable } from './tables/entities.js';
import { entityRelationsTable } from './tables/entity-relations.js';
import { contextSessionsTable } from './tables/context-sessions.js';
import { coreMemoryTable } from './tables/core-memory.js';
import { memoryHashCacheTable } from './tables/memory-hash-cache.js';
import { memoryMergeProposalsTable } from './tables/memory-merge-proposals.js';
import { memoryMergeHistoryTable } from './tables/memory-merge-history.js';
import { namespacesTable } from './tables/namespaces.js';

/**
 * Table order matters for foreign key constraints
 */
const SQLITE_TABLE_ORDER = [
  usersTable,
  projectsTable,
  conversationsTable,
  memoriesTable,
  memoryAssociationsTable,
  messagesTable,
  observationsTable,
  entitiesTable,
  entityRelationsTable,
  contextSessionsTable,
  coreMemoryTable,
  memoryHashCacheTable,
  memoryMergeProposalsTable,
  memoryMergeHistoryTable,
  namespacesTable,
];

const POSTGRES_TABLE_ORDER = [
  usersTable,
  projectsTable,
  conversationsTable,
  memoriesTable,
  memoryAssociationsTable,
  messagesTable,
  observationsTable,
  entitiesTable,
  entityRelationsTable,
  contextSessionsTable,
  coreMemoryTable,
  memoryHashCacheTable,
  memoryMergeProposalsTable,
  memoryMergeHistoryTable,
  namespacesTable,
];

/**
 * Generate complete SQLite schema SQL
 */
export function generateSqliteSchema(): string {
  const statements = SQLITE_TABLE_ORDER.map(t => t.sqlite).join('\n\n');
  return `PRAGMA foreign_keys = ON;\n\n${statements}`;
}

/**
 * Generate complete PostgreSQL schema SQL
 */
export function generatePostgresSchema(): string {
  const extensionStmt = `CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;`;
  
  const statements = POSTGRES_TABLE_ORDER.map(t => t.postgres).join('\n\n');
  return `${extensionStmt}\n\n${statements}`;
}

/**
 * Get all SQLite table definitions in order
 * @deprecated Use generateSqliteSchema() instead
 */
export function getAllSqliteTables() {
  return SQLITE_TABLE_ORDER.map(t => t.sqlite);
}

/**
 * Get all PostgreSQL table definitions in order
 * @deprecated Use generatePostgresSchema() instead
 */
export function getAllPostgresTables() {
  return POSTGRES_TABLE_ORDER.map(t => t.postgres);
}