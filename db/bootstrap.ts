import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../core/logger.js';
import { getDataDir } from '../config.js';
import { runAllMigrations } from './migrations/index.js';

/**
 * Note on boolean columns:
 * SQLite uses INTEGER 0/1 for boolean values (no native boolean type)
 * PostgreSQL uses native BOOLEAN type
 */

const sqliteSchemaSql = `
PRAGMA foreign_keys = ON;

-- Schema version tracking table (v1.2.0+)
CREATE TABLE IF NOT EXISTS _schema_versions (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

-- Agent preferences table (v1.2.0+) - stores accumulated agent preferences from learnings
CREATE TABLE IF NOT EXISTS agent_preferences (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_memory_id TEXT,
  confidence REAL DEFAULT 0.5,
  usage_count INTEGER DEFAULT 1,
  last_updated INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(project_id, key)
);

CREATE INDEX IF NOT EXISTS agent_preferences_project_idx ON agent_preferences(project_id);
CREATE INDEX IF NOT EXISTS agent_preferences_key_idx ON agent_preferences(key);

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
  place_id TEXT,
  place_sort_order INTEGER DEFAULT 0,
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
  confidence INTEGER DEFAULT 50,
  metadata TEXT,
  is_imported INTEGER DEFAULT 0,
  -- UAM: Agent integration columns
  agent_id TEXT,
  tool_name TEXT,
  session_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS learnings_project_idx ON learnings(project_id);
CREATE INDEX IF NOT EXISTS learnings_type_idx ON learnings(type);
CREATE INDEX IF NOT EXISTS learnings_action_idx ON learnings(action);
CREATE INDEX IF NOT EXISTS learnings_created_idx ON learnings(created_at);

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

-- Places table (v1.1.5) - Spatial memory organization
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  place_type TEXT NOT NULL,
  parent_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  description TEXT,
  purpose TEXT,
  memory_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS places_project_idx ON places(project_id);
CREATE INDEX IF NOT EXISTS places_type_idx ON places(place_type);
CREATE INDEX IF NOT EXISTS places_parent_idx ON places(parent_id);
CREATE INDEX IF NOT EXISTS places_sort_order_idx ON places(project_id, sort_order);

-- Memory-Place assignments
CREATE TABLE IF NOT EXISTS memory_places (
  id TEXT PRIMARY KEY,
  memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE NOT NULL,
  place_sort_order INTEGER DEFAULT 0,
  is_manual INTEGER DEFAULT 0,
  rule_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_places_memory_idx ON memory_places(memory_id);
CREATE INDEX IF NOT EXISTS memory_places_place_idx ON memory_places(place_id);

-- Place auto-assignment rules
CREATE TABLE IF NOT EXISTS place_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  place_type TEXT NOT NULL,
  match_tool TEXT,
  match_keyword TEXT,
  match_tag TEXT,
  match_memory_type TEXT,
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS place_rules_project_idx ON place_rules(project_id);
CREATE INDEX IF NOT EXISTS place_rules_type_idx ON place_rules(place_type);
-- session_summaries table
CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,
  content TEXT NOT NULL,
  compressed_from INTEGER,
  tokens_saved INTEGER,
  embedding BLOB,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_summaries_conversation_idx ON session_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS session_summaries_project_idx ON session_summaries(project_id);
CREATE INDEX IF NOT EXISTS session_summaries_type_idx ON session_summaries(summary_type);
CREATE INDEX IF NOT EXISTS session_summaries_created_idx ON session_summaries(created_at);

-- Belief Systems - Derived Beliefs from Memory (v1.3.0+)
CREATE TABLE IF NOT EXISTS beliefs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  belief_type TEXT NOT NULL,
  statement TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  belief_decay_rate INTEGER DEFAULT 30,
  last_confirmed_at INTEGER,
  source_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  reason TEXT,
  context TEXT,
  evidence_summary TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(project_id, normalized_key)
);
CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id);
CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type);
CREATE INDEX IF NOT EXISTS beliefs_status_idx ON beliefs(status);
CREATE INDEX IF NOT EXISTS beliefs_confidence_idx ON beliefs(confidence);

CREATE TABLE IF NOT EXISTS belief_memory_sources (
  id TEXT PRIMARY KEY,
  belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
  memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(belief_id, memory_id)
);
CREATE INDEX IF NOT EXISTS belief_sources_belief_idx ON belief_memory_sources(belief_id);
CREATE INDEX IF NOT EXISTS belief_sources_memory_idx ON belief_memory_sources(memory_id);

CREATE TABLE IF NOT EXISTS belief_edges (
  id TEXT PRIMARY KEY,
  from_belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
  to_belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  UNIQUE(from_belief_id, to_belief_id, edge_type)
);
CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id);
CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id);
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
    confidence INTEGER DEFAULT 50,
    metadata JSONB,
    is_imported BOOLEAN DEFAULT FALSE,
    -- UAM: Agent integration columns
    agent_id TEXT,
    tool_name TEXT,
    session_id TEXT,
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
  `CREATE INDEX IF NOT EXISTS memory_hash_cache_simhash_idx ON memory_hash_cache(simhash);`,
  // memory_associations table (v1.1.0+)
  `CREATE TABLE IF NOT EXISTS memory_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    association_type TEXT NOT NULL,
    weight REAL DEFAULT 1,
    coactivation_count INTEGER DEFAULT 1,
    metadata TEXT,
    last_coactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(from_memory_id, to_memory_id)
  );`,
  `CREATE INDEX IF NOT EXISTS associations_graph_traversal_idx ON memory_associations(from_memory_id, to_memory_id, weight, association_type);`,
  // namespaces table
  `CREATE TABLE IF NOT EXISTS namespaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES namespaces(id) ON DELETE SET NULL,
    metadata TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS namespaces_project_idx ON namespaces(project_id);`,
  `CREATE INDEX IF NOT EXISTS namespaces_parent_idx ON namespaces(parent_id);`,
  // maintenance_jobs table
  `CREATE TABLE IF NOT EXISTS maintenance_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    job_name TEXT NOT NULL,
    job_type TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    cron_expression TEXT,
    interval_ms INTEGER,
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_run_duration INTEGER,
    last_run_status TEXT,
    last_run_error TEXT,
    total_runs INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    job_config TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS maintenance_jobs_name_idx ON maintenance_jobs(job_name);`,
  `CREATE INDEX IF NOT EXISTS maintenance_jobs_next_run_idx ON maintenance_jobs(next_run_at);`,
  `CREATE INDEX IF NOT EXISTS maintenance_jobs_type_idx ON maintenance_jobs(job_type);`,
  `CREATE INDEX IF NOT EXISTS maintenance_jobs_enabled_idx ON maintenance_jobs(enabled);`,
  // places table (v1.1.5) - Spatial memory organization
  `CREATE TABLE IF NOT EXISTS places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    place_type TEXT NOT NULL,
    parent_id UUID REFERENCES places(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    description TEXT,
    purpose TEXT,
    memory_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS places_project_idx ON places(project_id);`,
  `CREATE INDEX IF NOT EXISTS places_type_idx ON places(place_type);`,
  `CREATE INDEX IF NOT EXISTS places_parent_idx ON places(parent_id);`,
  `CREATE INDEX IF NOT EXISTS places_sort_order_idx ON places(project_id, sort_order);`,
  // memory_places table
  `CREATE TABLE IF NOT EXISTS memory_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
    place_id UUID REFERENCES places(id) ON DELETE CASCADE NOT NULL,
    is_manual BOOLEAN DEFAULT FALSE,
    rule_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS memory_places_memory_idx ON memory_places(memory_id);`,
  `CREATE INDEX IF NOT EXISTS memory_places_place_idx ON memory_places(place_id);`,
  // place_rules table
  `CREATE TABLE IF NOT EXISTS place_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    place_type TEXT NOT NULL,
    match_tool TEXT,
    match_keyword TEXT,
    match_tag TEXT,
    match_memory_type TEXT,
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS place_rules_project_idx ON place_rules(project_id);`,
  `CREATE INDEX IF NOT EXISTS place_rules_type_idx ON place_rules(place_type);`,
  // Belief Systems - Derived Beliefs from Memory (v1.3.0+)
  `CREATE TABLE IF NOT EXISTS beliefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    belief_type TEXT NOT NULL,
    statement TEXT NOT NULL,
    normalized_key TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    belief_decay_rate INTEGER DEFAULT 30,
    last_confirmed_at TIMESTAMPTZ,
    source_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    reason TEXT,
    context TEXT,
    evidence_summary TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(project_id, normalized_key)
  );`,
  `CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id);`,
  `CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type);`,
  `CREATE INDEX IF NOT EXISTS beliefs_status_idx ON beliefs(status);`,
  `CREATE INDEX IF NOT EXISTS beliefs_confidence_idx ON beliefs(confidence);`,
  `CREATE TABLE IF NOT EXISTS belief_memory_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    belief_id UUID REFERENCES beliefs(id) ON DELETE CASCADE,
    memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(belief_id, memory_id)
  );`,
  `CREATE INDEX IF NOT EXISTS belief_sources_belief_idx ON belief_memory_sources(belief_id);`,
  `CREATE INDEX IF NOT EXISTS belief_sources_memory_idx ON belief_memory_sources(memory_id);`,
  `CREATE TABLE IF NOT EXISTS belief_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_belief_id UUID REFERENCES beliefs(id) ON DELETE CASCADE,
    to_belief_id UUID REFERENCES beliefs(id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(from_belief_id, to_belief_id, edge_type)
  );`,
  `CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id);`,
  `CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id);`
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
  
  // Initialize schema version tracking
  await initializeSchemaVersionTable(sqlite);
  
  // Run migrations AFTER (for existing databases that need column additions)
  await runSqliteMigrations(sqlite);
}

// Schema versions for tracking
const SCHEMA_VERSIONS = [
  { version: '1.2.0-base', description: 'Initial v1.2.0 schema with schema_versions table' },
  { version: '1.2.0-place-sort', description: 'Add place_sort_order column to places' },
  { version: '1.2.0-mem-place', description: 'Add place_sort_order to memories and memory_places' },
  { version: '1.2.0-agent-prefs', description: 'Add agent_preferences table for agent evolution' },
];

async function initializeSchemaVersionTable(sqlite: Database): Promise<void> {
  // Get existing versions
  const existingVersions = sqlite.prepare("SELECT version FROM _schema_versions").all() as Array<{version: string}>;
  const appliedVersions = new Set(existingVersions.map(v => v.version));
  
  // Insert any missing versions
  for (const { version, description } of SCHEMA_VERSIONS) {
    if (!appliedVersions.has(version)) {
      try {
        sqlite.prepare("INSERT INTO _schema_versions (version, description) VALUES (?, ?)").run(version, description);
        logger.info(`Schema version ${version} recorded`);
      } catch (error) {
        // Ignore duplicate errors
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('UNIQUE constraint failed')) {
          logger.warn(`Could not record schema version ${version}: ${msg}`);
        }
      }
    }
  }
}

export async function getSchemaVersion(sqlite: Database): Promise<string | null> {
  const result = sqlite.prepare("SELECT version FROM _schema_versions ORDER BY applied_at DESC LIMIT 1").get() as {version: string} | undefined;
  return result?.version || null;
}

export async function runMigrationsForVersion(sqlite: Database, targetVersion: string): Promise<void> {
  const currentVersion = await getSchemaVersion(sqlite);
  logger.info(`Current schema version: ${currentVersion}, target: ${targetVersion}`);
  
  // Run ensureSqliteSchema which handles all migrations
  await runSqliteMigrations(sqlite);
}

async function runSqliteMigrations(sqlite: Database): Promise<void> {
  // All migrations are in separate files - just run them all
  await runAllMigrations(sqlite);
}

export async function ensurePostgresSchema(pool: Pool): Promise<void> {
  for (const statement of postgresStatements) {
    await pool.query(statement);
  }
}
