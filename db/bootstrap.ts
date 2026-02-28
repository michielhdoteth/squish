import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../core/logger.js';
import { getDataDir } from '../config.js';

const sqliteSchemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE,
  name TEXT,
  email TEXT,
  preferences TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_path_idx ON projects(path);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  embedding_json TEXT,
  embedding BLOB,
  source TEXT,
  confidence INTEGER DEFAULT 100,
  tags TEXT,
  metadata TEXT,
  is_private INTEGER DEFAULT 0,
  has_secrets INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 50,
  is_active INTEGER DEFAULT 1,
  expires_at INTEGER,
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER,
  is_merged INTEGER DEFAULT 0,
  merged_into_id TEXT,
  merged_at INTEGER,
  is_canonical INTEGER DEFAULT 0,
  merge_source_ids TEXT,
  is_mergeable INTEGER DEFAULT 1,
  merge_version INTEGER DEFAULT 1,
  importance_score INTEGER DEFAULT 50,
  importance_decay_rate INTEGER DEFAULT 30,
  last_importance_recalc INTEGER,
  consolidated_into TEXT,
  consolidated_at INTEGER,
  is_consolidated INTEGER DEFAULT 0,
  sector TEXT DEFAULT 'episodic',
  tier TEXT DEFAULT 'hot',
  context_status TEXT DEFAULT 'out-of-context',
  decay_rate INTEGER DEFAULT 30,
  coactivation_score INTEGER DEFAULT 0,
  last_decay_at INTEGER DEFAULT (strftime('%s','now')),
  agent_id TEXT,
  agent_role TEXT,
  visibility_scope TEXT DEFAULT 'private',
  is_protected INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_immutable INTEGER DEFAULT 0,
  write_scope TEXT,
  read_scope TEXT,
  triggered_by TEXT,
  capture_reason TEXT,
  last_used_at INTEGER,
  usage_count INTEGER DEFAULT 0,
  valid_from INTEGER,
  valid_to INTEGER,
  superseded_by TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS memories_project_idx ON memories(project_id);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);
CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories(tags);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  message_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  started_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  ended_at INTEGER,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations(project_id);
CREATE INDEX IF NOT EXISTS conversations_session_idx ON conversations(session_id);
CREATE INDEX IF NOT EXISTS conversations_started_idx ON conversations(started_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT,
  token_count INTEGER,
  tool_calls TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_role_idx ON messages(role);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  embedding_json TEXT,
  category TEXT,
  importance INTEGER DEFAULT 50,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_project_idx ON observations(project_id);
CREATE INDEX IF NOT EXISTS observations_type_idx ON observations(type);
CREATE INDEX IF NOT EXISTS observations_action_idx ON observations(action);
CREATE INDEX IF NOT EXISTS observations_created_idx ON observations(created_at);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  embedding_json TEXT,
  properties TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_project_idx ON entities(project_id);
CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(type);
CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(name);

CREATE TABLE IF NOT EXISTS entity_relations (
  id TEXT PRIMARY KEY,
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  weight INTEGER DEFAULT 1,
  properties TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS relations_from_idx ON entity_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS relations_to_idx ON entity_relations(to_entity_id);
CREATE INDEX IF NOT EXISTS relations_type_idx ON entity_relations(type);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  tags,
  content='memories',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags)
  VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags)
  VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''));
  INSERT INTO memories_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, COALESCE(new.tags, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;

CREATE TABLE IF NOT EXISTS core_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  section TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER DEFAULT 0 NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS core_memory_project_idx ON core_memory(project_id);
CREATE INDEX IF NOT EXISTS core_memory_user_idx ON core_memory(user_id);
CREATE INDEX IF NOT EXISTS core_memory_section_idx ON core_memory(section);

CREATE TABLE IF NOT EXISTS context_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  loaded_memory_ids TEXT,
  token_budget INTEGER DEFAULT 8000 NOT NULL,
  tokens_used INTEGER DEFAULT 0 NOT NULL,
  core_memory_tokens INTEGER DEFAULT 0 NOT NULL,
  loaded_memories_tokens INTEGER DEFAULT 0 NOT NULL,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS context_sessions_session_idx ON context_sessions(session_id);
CREATE INDEX IF NOT EXISTS context_sessions_project_idx ON context_sessions(project_id);
CREATE INDEX IF NOT EXISTS context_sessions_created_idx ON context_sessions(created_at);

-- v0.8.0: Memory Merge Tables
CREATE TABLE IF NOT EXISTS memory_merge_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_memory_ids TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  proposed_summary TEXT,
  proposed_tags TEXT,
  proposed_metadata TEXT,
  detection_method TEXT NOT NULL,
  similarity_score TEXT NOT NULL,
  confidence_level TEXT NOT NULL,
  merge_reason TEXT NOT NULL,
  conflict_warnings TEXT,
  status TEXT DEFAULT 'pending' NOT NULL,
  reviewed_at INTEGER,
  review_notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS memory_merge_proposals_project_status_idx ON memory_merge_proposals(project_id, status);
CREATE INDEX IF NOT EXISTS memory_merge_proposals_created_at_idx ON memory_merge_proposals(created_at);

CREATE TABLE IF NOT EXISTS memory_merge_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  proposal_id TEXT REFERENCES memory_merge_proposals(id) ON DELETE SET NULL,
  source_memory_ids TEXT NOT NULL,
  canonical_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  source_memories_snapshot TEXT NOT NULL,
  merge_strategy TEXT NOT NULL,
  tokens_saved INTEGER,
  is_reversed INTEGER DEFAULT 0,
  reversed_at INTEGER,
  reversed_by TEXT,
  merged_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_hash_cache (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  simhash TEXT,
  minhash TEXT,
  content_hash TEXT NOT NULL,
  last_updated INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_hash_cache_project_id_idx ON memory_hash_cache(project_id);
CREATE INDEX IF NOT EXISTS memory_hash_cache_simhash_idx ON memory_hash_cache(simhash);
`;

const postgresStatements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
  `CREATE EXTENSION IF NOT EXISTS vector;`,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    preferences JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS projects_path_idx ON projects(path);`,
  `CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    embedding vector(1536),
    source TEXT,
    confidence INTEGER DEFAULT 100,
    tags TEXT[],
    metadata JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS memories_project_idx ON memories(project_id);`,
  `CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);`,
  `CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at);`,
  `CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories USING GIN(tags);`,
  `CREATE INDEX IF NOT EXISTS memories_content_trgm_idx ON memories USING GIN (content gin_trgm_ops);`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ended_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations(project_id);`,
  `CREATE INDEX IF NOT EXISTS conversations_session_idx ON conversations(session_id);`,
  `CREATE INDEX IF NOT EXISTS conversations_started_idx ON conversations(started_at);`,
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    token_count INTEGER,
    tool_calls JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);`,
  `CREATE INDEX IF NOT EXISTS messages_role_idx ON messages(role);`,
  `CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);`,
  `CREATE INDEX IF NOT EXISTS messages_content_trgm_idx ON messages USING GIN (content gin_trgm_ops);`,
  `CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    summary TEXT NOT NULL,
    details JSONB,
    embedding vector(1536),
    category TEXT,
    importance INTEGER DEFAULT 50,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS observations_project_idx ON observations(project_id);`,
  `CREATE INDEX IF NOT EXISTS observations_type_idx ON observations(type);`,
  `CREATE INDEX IF NOT EXISTS observations_action_idx ON observations(action);`,
  `CREATE INDEX IF NOT EXISTS observations_created_idx ON observations(created_at);`,
  `CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    embedding vector(1536),
    properties JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS entities_project_idx ON entities(project_id);`,
  `CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(type);`,
  `CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(name);`,
  `CREATE TABLE IF NOT EXISTS entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    weight INTEGER DEFAULT 1,
    properties JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS relations_from_idx ON entity_relations(from_entity_id);`,
  `CREATE INDEX IF NOT EXISTS relations_to_idx ON entity_relations(to_entity_id);`,
  `CREATE INDEX IF NOT EXISTS relations_type_idx ON entity_relations(type);`
];

/**
 * Ensure the data directory exists (.squish folder in project root)
 */
export async function ensureDataDirectory(): Promise<void> {
  try {
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory at: ${dataDir}`);
    }
  } catch (error) {
    logger.error('Failed to create data directory', error);
    throw new Error(`Failed to initialize data directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function ensureSqliteSchema(sqlite: Database): Promise<void> {
  // Run schema creation FIRST (creates tables with latest schema)
  sqlite.exec(sqliteSchemaSql);
  
  // Run migrations AFTER (for existing databases that need column additions)
  await runSqliteMigrations(sqlite);
}

async function runSqliteMigrations(sqlite: Database): Promise<void> {
  // Check if memories table exists
  const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'").get() as {name: string} | undefined;
  
  if (!tableCheck) {
    // Table doesn't exist yet - it will be created by schema SQL with all columns
    // No migrations needed
    return;
  }
  
  // Check what columns the table has
  const tableInfo = sqlite.prepare("PRAGMA table_info(memories)").all() as Array<{name: string}>;
  const existingColumns = new Set(tableInfo.map(col => col.name));
  
  // Add missing columns one by one (SQLite allows only one ALTER at a time)
  const migrations = [
    { col: 'embedding', sql: 'ALTER TABLE memories ADD COLUMN embedding BLOB' },
    { col: 'is_private', sql: 'ALTER TABLE memories ADD COLUMN is_private INTEGER DEFAULT 0' },
    { col: 'has_secrets', sql: 'ALTER TABLE memories ADD COLUMN has_secrets INTEGER DEFAULT 0' },
    { col: 'relevance_score', sql: 'ALTER TABLE memories ADD COLUMN relevance_score INTEGER DEFAULT 50' },
    { col: 'is_merged', sql: 'ALTER TABLE memories ADD COLUMN is_merged INTEGER DEFAULT 0' },
    { col: 'merged_into_id', sql: 'ALTER TABLE memories ADD COLUMN merged_into_id TEXT' },
    { col: 'is_mergeable', sql: 'ALTER TABLE memories ADD COLUMN is_mergeable INTEGER DEFAULT 1' },
    { col: 'is_canonical', sql: 'ALTER TABLE memories ADD COLUMN is_canonical INTEGER DEFAULT 0' },
    // v0.8.0: Importance scoring
    { col: 'importance_score', sql: 'ALTER TABLE memories ADD COLUMN importance_score INTEGER DEFAULT 50' },
    { col: 'importance_decay_rate', sql: 'ALTER TABLE memories ADD COLUMN importance_decay_rate INTEGER DEFAULT 30' },
    { col: 'last_importance_recalc', sql: 'ALTER TABLE memories ADD COLUMN last_importance_recalc INTEGER' },
    // v0.8.0: Consolidation
    { col: 'consolidated_into', sql: 'ALTER TABLE memories ADD COLUMN consolidated_into TEXT' },
    { col: 'consolidated_at', sql: 'ALTER TABLE memories ADD COLUMN consolidated_at INTEGER' },
    { col: 'is_consolidated', sql: 'ALTER TABLE memories ADD COLUMN is_consolidated INTEGER DEFAULT 0' },
  ];
  
  for (const migration of migrations) {
    if (!existingColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to memories table`);
      } catch (error) {
        // Silent fail - column might already exist
        logger.debug(`Migration skipped for ${migration.col}: ${error}`);
      }
    }
  }
}

export async function ensurePostgresSchema(pool: Pool): Promise<void> {
  for (const statement of postgresStatements) {
    await pool.query(statement);
  }
}
