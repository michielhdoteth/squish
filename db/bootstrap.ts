import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../core/logger.js';
import { getDataDir } from '../config.js';

/**
 * Note on boolean columns:
 * SQLite uses INTEGER 0/1 for boolean values (no native boolean type)
 * PostgreSQL uses native BOOLEAN type
 */

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
  confidence INTEGER DEFAULT 50,
  confidence_level TEXT DEFAULT 'speculative',
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

CREATE TABLE IF NOT EXISTS memory_associations (
  id TEXT PRIMARY KEY,
  from_memory_id TEXT NOT NULL,
  to_memory_id TEXT NOT NULL,
  association_type TEXT NOT NULL,
  weight REAL DEFAULT 1,
  coactivation_count INTEGER DEFAULT 1,
  metadata TEXT,
  last_coactivated_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(from_memory_id, to_memory_id)
);

-- Composite index for graph traversal (v1.1.0)
CREATE INDEX IF NOT EXISTS associations_graph_traversal_idx ON memory_associations(from_memory_id, to_memory_id, weight, association_type);

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

-- Learnings table (renamed from observations)
CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  embedding_json TEXT,
  embedding BLOB,
  memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
  folder_path TEXT,
  project_path TEXT,
  is_private INTEGER DEFAULT 0,
  has_secrets INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 50,
  category TEXT,
  importance INTEGER DEFAULT 50,
  metadata TEXT,
  is_imported INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS learnings_project_idx ON learnings(project_id);
CREATE INDEX IF NOT EXISTS learnings_type_idx ON learnings(type);
CREATE INDEX IF NOT EXISTS learnings_action_idx ON learnings(action);
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
  tokens_estimate INTEGER DEFAULT 0 NOT NULL,
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

-- Namespaces table (v1.0.x) - Hierarchical organization
CREATE TABLE IF NOT EXISTS namespaces (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  description TEXT,
  parent_id TEXT REFERENCES namespaces(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS namespaces_project_idx ON namespaces(project_id);
CREATE INDEX IF NOT EXISTS namespaces_parent_idx ON namespaces(parent_id);

-- Maintenance jobs table (v1.0.x) - Cron scheduler
CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  cron_expression TEXT,
  enabled INTEGER DEFAULT 1 NOT NULL,
  last_run_at INTEGER,
  last_run_duration INTEGER,
  last_run_status TEXT,
  last_run_error TEXT,
  total_runs INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  job_config TEXT,
  next_run_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_jobs_name_idx ON maintenance_jobs(job_name);
CREATE INDEX IF NOT EXISTS maintenance_jobs_next_run_idx ON maintenance_jobs(next_run_at);
CREATE INDEX IF NOT EXISTS maintenance_jobs_type_idx ON maintenance_jobs(job_type);
CREATE INDEX IF NOT EXISTS maintenance_jobs_enabled_idx ON maintenance_jobs(enabled);
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
  embedding_json TEXT,
  embedding vector(1536),
  source TEXT,
  confidence INTEGER DEFAULT 50,
  confidence_level TEXT DEFAULT 'speculative',
  tags TEXT[],
  metadata JSONB,
  is_private BOOLEAN DEFAULT FALSE,
  has_secrets BOOLEAN DEFAULT FALSE,
  relevance_score INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into_id UUID,
  merged_at TIMESTAMPTZ,
  is_canonical BOOLEAN DEFAULT TRUE,
  merge_source_ids TEXT[],
  is_mergeable BOOLEAN DEFAULT TRUE,
  merge_version INTEGER DEFAULT 1,
  importance_score INTEGER DEFAULT 50,
  importance_decay_rate INTEGER DEFAULT 30,
  last_importance_recalc TIMESTAMPTZ,
  consolidated_into UUID,
  consolidated_at TIMESTAMPTZ,
  is_consolidated BOOLEAN DEFAULT FALSE,
  sector TEXT DEFAULT 'episodic',
  tier TEXT DEFAULT 'hot',
  status TEXT DEFAULT 'active',
  context_status TEXT DEFAULT 'out-of-context',
  decay_rate INTEGER DEFAULT 30,
  coactivation_score INTEGER DEFAULT 0,
  last_decay_at TIMESTAMPTZ,
  agent_id TEXT,
  agent_role TEXT,
  visibility_scope TEXT DEFAULT 'private',
  is_protected BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_immutable BOOLEAN DEFAULT FALSE,
  write_scope TEXT[],
  read_scope TEXT[],
  triggered_by TEXT,
  capture_reason TEXT,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  tokens_estimate INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_by UUID,
  version INTEGER DEFAULT 1,
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
  // Learnings table (renamed from observations)
  `CREATE TABLE IF NOT EXISTS learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    summary TEXT NOT NULL,
    details JSONB,
    embedding vector(1536),
    memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
    category TEXT,
    importance INTEGER DEFAULT 50,
    metadata JSONB,
    is_imported BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS learnings_project_idx ON learnings(project_id);`,
  `CREATE INDEX IF NOT EXISTS learnings_type_idx ON learnings(type);`,
  `CREATE INDEX IF NOT EXISTS learnings_action_idx ON learnings(action);`,
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
  `CREATE INDEX IF NOT EXISTS relations_type_idx ON entity_relations(type);`,
  `CREATE TABLE IF NOT EXISTS core_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    section TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER DEFAULT 0 NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS core_memory_project_idx ON core_memory(project_id);`,
  `CREATE INDEX IF NOT EXISTS core_memory_user_idx ON core_memory(user_id);`,
  `CREATE INDEX IF NOT EXISTS core_memory_section_idx ON core_memory(section);`,
  `CREATE TABLE IF NOT EXISTS context_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    loaded_memory_ids JSONB,
    token_budget INTEGER DEFAULT 8000 NOT NULL,
    tokens_used INTEGER DEFAULT 0 NOT NULL,
    core_memory_tokens INTEGER DEFAULT 0 NOT NULL,
    loaded_memories_tokens INTEGER DEFAULT 0 NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS context_sessions_session_idx ON context_sessions(session_id);`,
  `CREATE INDEX IF NOT EXISTS context_sessions_project_idx ON context_sessions(project_id);`,
  `CREATE INDEX IF NOT EXISTS context_sessions_created_idx ON context_sessions(created_at);`,
  `CREATE TABLE IF NOT EXISTS memory_merge_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    source_memory_ids TEXT NOT NULL,
    proposed_content TEXT NOT NULL,
    proposed_summary TEXT,
    proposed_tags TEXT[],
    proposed_metadata JSONB,
    detection_method TEXT NOT NULL,
    similarity_score TEXT NOT NULL,
    confidence_level TEXT NOT NULL,
    merge_reason TEXT NOT NULL,
    conflict_warnings JSONB,
    status TEXT DEFAULT 'pending' NOT NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ
  );`,
  `CREATE INDEX IF NOT EXISTS memory_merge_proposals_project_status_idx ON memory_merge_proposals(project_id, status);`,
  `CREATE INDEX IF NOT EXISTS memory_merge_proposals_created_at_idx ON memory_merge_proposals(created_at);`,
  `CREATE TABLE IF NOT EXISTS memory_merge_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    proposal_id UUID REFERENCES memory_merge_proposals(id) ON DELETE SET NULL,
    source_memory_ids TEXT NOT NULL,
    canonical_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    source_memories_snapshot JSONB NOT NULL,
    merge_strategy TEXT NOT NULL,
    tokens_saved INTEGER,
    is_reversed BOOLEAN DEFAULT FALSE,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID,
    merged_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS memory_hash_cache (
    memory_id UUID PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    simhash TEXT,
    minhash TEXT,
    content_hash TEXT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS memory_hash_cache_project_id_idx ON memory_hash_cache(project_id);`,
  `CREATE INDEX IF NOT EXISTS memory_hash_cache_simhash_idx ON memory_hash_cache(simhash);`
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
   
    // Migrations for memories table (deduplicated, ordered by version)
     const memoriesMigrations = [
       // Base columns (v0.1.x - v0.5.x)
       { col: 'embedding', sql: 'ALTER TABLE memories ADD COLUMN embedding BLOB' },
       { col: 'relevance_score', sql: 'ALTER TABLE memories ADD COLUMN relevance_score INTEGER DEFAULT 50' },

       // Merge tracking (v0.6.x)
       { col: 'is_merged', sql: 'ALTER TABLE memories ADD COLUMN is_merged INTEGER DEFAULT 0' },
       { col: 'merged_into_id', sql: 'ALTER TABLE memories ADD COLUMN merged_into_id TEXT' },
       { col: 'is_mergeable', sql: 'ALTER TABLE memories ADD COLUMN is_mergeable INTEGER DEFAULT 1' },
       { col: 'is_canonical', sql: 'ALTER TABLE memories ADD COLUMN is_canonical INTEGER DEFAULT 0' },
       { col: 'merged_at', sql: 'ALTER TABLE memories ADD COLUMN merged_at INTEGER' },
       { col: 'merge_source_ids', sql: 'ALTER TABLE memories ADD COLUMN merge_source_ids TEXT' },
       { col: 'merge_version', sql: 'ALTER TABLE memories ADD COLUMN merge_version INTEGER DEFAULT 1' },

       // Importance scoring (v0.8.0)
       { col: 'importance_score', sql: 'ALTER TABLE memories ADD COLUMN importance_score INTEGER DEFAULT 50' },
       { col: 'importance_decay_rate', sql: 'ALTER TABLE memories ADD COLUMN importance_decay_rate INTEGER DEFAULT 30' },
       { col: 'last_importance_recalc', sql: 'ALTER TABLE memories ADD COLUMN last_importance_recalc INTEGER' },

       // Consolidation (v0.8.0)
       { col: 'consolidated_into', sql: 'ALTER TABLE memories ADD COLUMN consolidated_into TEXT' },
       { col: 'consolidated_at', sql: 'ALTER TABLE memories ADD COLUMN consolidated_at INTEGER' },
       { col: 'is_consolidated', sql: 'ALTER TABLE memories ADD COLUMN is_consolidated INTEGER DEFAULT 0' },

       // Memory lifecycle (v0.8.0)
       { col: 'sector', sql: 'ALTER TABLE memories ADD COLUMN sector TEXT DEFAULT "episodic"' },
       { col: 'tier', sql: 'ALTER TABLE memories ADD COLUMN tier TEXT DEFAULT "hot"' },
       { col: 'context_status', sql: 'ALTER TABLE memories ADD COLUMN context_status TEXT DEFAULT "out-of-context"' },
       { col: 'decay_rate', sql: 'ALTER TABLE memories ADD COLUMN decay_rate INTEGER DEFAULT 30' },
       { col: 'coactivation_score', sql: 'ALTER TABLE memories ADD COLUMN coactivation_score INTEGER DEFAULT 0' },
       { col: 'last_decay_at', sql: 'ALTER TABLE memories ADD COLUMN last_decay_at INTEGER DEFAULT (strftime(\'%s\',\'now\'))' },

       // Agent tracking (v0.8.0)
       { col: 'agent_id', sql: 'ALTER TABLE memories ADD COLUMN agent_id TEXT' },
       { col: 'agent_role', sql: 'ALTER TABLE memories ADD COLUMN agent_role TEXT' },
       { col: 'retrieval_priority', sql: 'ALTER TABLE memories ADD COLUMN retrieval_priority INTEGER DEFAULT 50' },

        // Data governance (v0.9.0)
        { col: 'recorded_at', sql: 'ALTER TABLE memories ADD COLUMN recorded_at INTEGER DEFAULT (strftime(\'%s\',\'now\'))' },
        { col: 'confidence', sql: 'ALTER TABLE memories ADD COLUMN confidence INTEGER DEFAULT 50' },
        { col: 'valid_from', sql: 'ALTER TABLE memories ADD COLUMN valid_from INTEGER' },
       { col: 'valid_to', sql: 'ALTER TABLE memories ADD COLUMN valid_to INTEGER' },
       { col: 'superseded_by', sql: 'ALTER TABLE memories ADD COLUMN superseded_by TEXT' },
       { col: 'version', sql: 'ALTER TABLE memories ADD COLUMN version INTEGER DEFAULT 1' },
       { col: 'is_active', sql: 'ALTER TABLE memories ADD COLUMN is_active INTEGER DEFAULT 1' },
       { col: 'expires_at', sql: 'ALTER TABLE memories ADD COLUMN expires_at INTEGER' },

       // Privacy & access (v0.9.0)
       { col: 'is_private', sql: 'ALTER TABLE memories ADD COLUMN is_private INTEGER DEFAULT 0' },
       { col: 'has_secrets', sql: 'ALTER TABLE memories ADD COLUMN has_secrets INTEGER DEFAULT 0' },
       { col: 'visibility_scope', sql: 'ALTER TABLE memories ADD COLUMN visibility_scope TEXT DEFAULT "private"' },
       { col: 'is_protected', sql: 'ALTER TABLE memories ADD COLUMN is_protected INTEGER DEFAULT 0' },
       { col: 'is_pinned', sql: 'ALTER TABLE memories ADD COLUMN is_pinned INTEGER DEFAULT 0' },
       { col: 'is_immutable', sql: 'ALTER TABLE memories ADD COLUMN is_immutable INTEGER DEFAULT 0' },
       { col: 'write_scope', sql: 'ALTER TABLE memories ADD COLUMN write_scope TEXT' },
       { col: 'read_scope', sql: 'ALTER TABLE memories ADD COLUMN read_scope TEXT' },

       // Usage tracking (v0.9.0)
       { col: 'triggered_by', sql: 'ALTER TABLE memories ADD COLUMN triggered_by TEXT' },
       { col: 'capture_reason', sql: 'ALTER TABLE memories ADD COLUMN capture_reason TEXT' },
       { col: 'last_used_at', sql: 'ALTER TABLE memories ADD COLUMN last_used_at INTEGER' },
       { col: 'usage_count', sql: 'ALTER TABLE memories ADD COLUMN usage_count INTEGER DEFAULT 0' },
       { col: 'user_id', sql: 'ALTER TABLE memories ADD COLUMN user_id TEXT' },

       // Layer tracking (v0.9.x)
       { col: 'has_l0_abstract', sql: 'ALTER TABLE memories ADD COLUMN has_l0_abstract INTEGER DEFAULT 0' },
       { col: 'has_l1_overview', sql: 'ALTER TABLE memories ADD COLUMN has_l1_overview INTEGER DEFAULT 0' },
       { col: 'last_layer_update', sql: 'ALTER TABLE memories ADD COLUMN last_layer_update INTEGER' },

       // Namespace support (v1.0.x)
       { col: 'namespace_id', sql: 'ALTER TABLE memories ADD COLUMN namespace_id TEXT REFERENCES namespaces(id) ON DELETE SET NULL' },
       { col: 'namespace_path', sql: 'ALTER TABLE memories ADD COLUMN namespace_path TEXT' },

	// Token tracking (v1.0.x)
	{ col: 'tokens_estimate', sql: 'ALTER TABLE memories ADD COLUMN tokens_estimate INTEGER DEFAULT 0' },

	// Iteration 3: Confidence flags (default: speculative)
	{ col: 'confidence_level', sql: 'ALTER TABLE memories ADD COLUMN confidence_level TEXT DEFAULT "speculative"' },

	// v1.1.0: Status and encryption
	{ col: 'status', sql: 'ALTER TABLE memories ADD COLUMN status TEXT DEFAULT "active"' },
	{ col: 'encrypted_content', sql: 'ALTER TABLE memories ADD COLUMN encrypted_content TEXT' },
	{ col: 'encryption_nonce', sql: 'ALTER TABLE memories ADD COLUMN encryption_nonce TEXT' },
	{ col: 'is_encrypted', sql: 'ALTER TABLE memories ADD COLUMN is_encrypted INTEGER DEFAULT 0' },
];
   
   // Get existing columns for memories table
   const tableInfo = sqlite.prepare("PRAGMA table_info(memories)").all() as Array<{name: string}>;
   const existingColumns = new Set(tableInfo.map(col => col.name));
   
   for (const migration of memoriesMigrations) {
     if (!existingColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to memories table`);
      } catch (error) {
        // Re-throw real errors - only ignore "duplicate column" errors
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('duplicate column name')) {
          logger.debug(`Migration skipped for ${migration.col}: column already exists`);
        } else {
          throw new Error(`Migration failed for column ${migration.col}: ${msg}`);
        }
      }
     }
   }
   
    // v0.9.2: Add tokens_estimate to core_memory
    const coreMemoryTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='core_memory'").get() as {name: string} | undefined;
    if (coreMemoryTableCheck) {
      const coreMemoryInfo = sqlite.prepare("PRAGMA table_info(core_memory)").all() as Array<{name: string}>;
      const existingCoreMemoryColumns = new Set(coreMemoryInfo.map(col => col.name));
      
      const coreMemoryMigrations = [
        { col: 'tokens_estimate', sql: 'ALTER TABLE core_memory ADD COLUMN tokens_estimate INTEGER DEFAULT 0 NOT NULL' },
      ];
      
      for (const migration of coreMemoryMigrations) {
        if (!existingCoreMemoryColumns.has(migration.col)) {
          try {
            sqlite.exec(migration.sql);
            logger.info(`Migration: Added column ${migration.col} to core_memory table`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('duplicate column name')) {
              logger.debug(`Migration skipped for ${migration.col}: column already exists`);
            } else {
              throw new Error(`Migration failed for column ${migration.col}: ${msg}`);
            }
          }
        }
      }
    }

    // Migrations for learnings table (v1.2.x) - renamed from observations
    // First, check if we need to rename observations -> learnings
    const observationsTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations'").get() as {name: string} | undefined;
    const learningsTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learnings'").get() as {name: string} | undefined;
    
    if (observationsTableCheck && !learningsTableCheck) {
      // Rename observations to learnings
      try {
        sqlite.exec("ALTER TABLE observations RENAME TO learnings");
        logger.info("Migration: Renamed observations table to learnings");
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        logger.warn(`Migration note: Could not rename observations to learnings: ${err}`);
      }
    }

    // Now run migrations on learnings table (whether renamed or new)
    const learningsInfo = sqlite.prepare("PRAGMA table_info(learnings)").all() as Array<{name: string}>;
    const existingLearningsColumns = new Set(learningsInfo.map(col => col.name));

    const learningsMigrations = [
      { col: 'embedding', sql: 'ALTER TABLE learnings ADD COLUMN embedding BLOB' },
      { col: 'folder_path', sql: 'ALTER TABLE learnings ADD COLUMN folder_path TEXT' },
      { col: 'project_path', sql: 'ALTER TABLE learnings ADD COLUMN project_path TEXT' },
      { col: 'is_private', sql: 'ALTER TABLE learnings ADD COLUMN is_private INTEGER DEFAULT 0' },
      { col: 'has_secrets', sql: 'ALTER TABLE learnings ADD COLUMN has_secrets INTEGER DEFAULT 0' },
      { col: 'relevance_score', sql: 'ALTER TABLE learnings ADD COLUMN relevance_score INTEGER DEFAULT 50' },
      { col: 'memory_id', sql: 'ALTER TABLE learnings ADD COLUMN memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL' },
      { col: 'is_imported', sql: 'ALTER TABLE learnings ADD COLUMN is_imported INTEGER DEFAULT 0' },
    ];

    for (const migration of learningsMigrations) {
      if (!existingLearningsColumns.has(migration.col)) {
        try {
          sqlite.exec(migration.sql);
          logger.info(`Migration: Added column ${migration.col} to learnings table`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('duplicate column name')) {
            logger.debug(`Migration skipped for ${migration.col}: column already exists`);
          } else {
            logger.warn(`Migration note for ${migration.col}: ${msg}`);
          }
        }
      }
    }

    // Add indexes if they don't exist
    const existingIndexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='learnings'").all() as Array<{name: string}>;
    const existingIndexNames = new Set(existingIndexes.map(idx => idx.name));

    const indexMigrations = [
      { name: 'learnings_folder_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_folder_idx ON learnings(folder_path)' },
      { name: 'learnings_relevance_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_relevance_idx ON learnings(relevance_score)' },
      { name: 'learnings_private_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_private_idx ON learnings(is_private)' },
      { name: 'learnings_memory_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_memory_idx ON learnings(memory_id)' },
    ];

    for (const idx of indexMigrations) {
      if (!existingIndexNames.has(idx.name)) {
        try {
          sqlite.exec(idx.sql);
          logger.info(`Migration: Added index ${idx.name} to learnings table`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`Index migration note for ${idx.name}: ${msg}`);
        }
      }
    }

    // Migrations for maintenance_jobs table (v1.0.x)
    const maintenanceJobsTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_jobs'").get() as {name: string} | undefined;
    if (maintenanceJobsTableCheck) {
      const maintenanceJobsInfo = sqlite.prepare("PRAGMA table_info(maintenance_jobs)").all() as Array<{name: string}>;
      const existingMaintenanceJobsColumns = new Set(maintenanceJobsInfo.map(col => col.name));
      
      // Check if table has wrong schema (camelCase columns from bug in earlier version)
      const hasCamelCaseColumns = existingMaintenanceJobsColumns.has('jobName') || 
                                  existingMaintenanceJobsColumns.has('jobType') ||
                                  existingMaintenanceJobsColumns.has('cronExpression');
      
      if (hasCamelCaseColumns) {
        // Table has incorrect camelCase schema - need to recreate it
        logger.warn('Maintenance jobs table has incorrect schema (camelCase columns). Recreating...');
        try {
          // Drop the malformed table
          sqlite.exec('DROP TABLE IF EXISTS maintenance_jobs');
          // Recreate with correct schema - it will be created by the schema SQL
          logger.info('Dropped malformed maintenance_jobs table. It will be recreated with correct schema.');
        } catch (error) {
          logger.error('Failed to recreate maintenance_jobs table:', error);
        }
      } else {
        // Normal migrations for correct schema
        const maintenanceJobsMigrations = [
          { col: 'schedule', sql: 'ALTER TABLE maintenance_jobs DROP COLUMN schedule' },
          { col: 'cron_expression', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN cron_expression TEXT' },
          { col: 'last_run_at', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_at INTEGER' },
          { col: 'last_run_duration', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_duration INTEGER' },
          { col: 'last_run_status', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_status TEXT' },
          { col: 'last_run_error', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_error TEXT' },
          { col: 'total_runs', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN total_runs INTEGER DEFAULT 0' },
          { col: 'success_count', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN success_count INTEGER DEFAULT 0' },
          { col: 'failure_count', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN failure_count INTEGER DEFAULT 0' },
          { col: 'job_config', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN job_config TEXT' },
          { col: 'next_run_at', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN next_run_at INTEGER' },
          { col: 'run_count', sql: 'ALTER TABLE maintenance_jobs DROP COLUMN run_count' },
        ];
        
        for (const migration of maintenanceJobsMigrations) {
          // For DROP migrations, only run if column EXISTS
          // For ADD migrations, only run if column does NOT exist
          const shouldRun = migration.sql.startsWith('ALTER TABLE maintenance_jobs DROP COLUMN')
            ? existingMaintenanceJobsColumns.has(migration.col)
            : !existingMaintenanceJobsColumns.has(migration.col);
            
          if (shouldRun) {
            try {
              sqlite.exec(migration.sql);
              logger.info(`Migration: ${migration.col} on maintenance_jobs table`);
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (msg.includes('duplicate column name') || msg.includes('no such column')) {
                logger.debug(`Migration skipped for ${migration.col}: ${msg.includes('duplicate column name') ? 'column already exists' : 'column does not exist'}`);
              } else {
                throw new Error(`Migration failed for column ${migration.col}: ${msg}`);
              }
            }
          }
        }
      }
    }
}

export async function ensurePostgresSchema(pool: Pool): Promise<void> {
  for (const statement of postgresStatements) {
    await pool.query(statement);
  }
}
