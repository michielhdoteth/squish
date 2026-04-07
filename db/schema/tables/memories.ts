/**
 * Memories Table Schema
 * SQLite and PostgreSQL definitions
 */

export const memoriesTable = {
  sqlite: `
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
  confidence_level TEXT DEFAULT 'certain',
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
  status TEXT DEFAULT 'active',
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
  tokens_estimate INTEGER DEFAULT 0,
  valid_from INTEGER,
  valid_to INTEGER,
  recorded_at INTEGER,
  superseded_by TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS memories_project_idx ON memories(project_id);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);
CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories(tags);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags, summary, content='memories', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags, summary)
  VALUES (NEW.rowid, NEW.content, NEW.tags, NEW.summary);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
  VALUES ('delete', OLD.rowid, OLD.content, OLD.tags, OLD.summary);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
  VALUES ('delete', OLD.rowid, OLD.content, OLD.tags, OLD.summary);
  INSERT INTO memories_fts(rowid, content, tags, summary)
  VALUES (NEW.rowid, NEW.content, NEW.tags, NEW.summary);
END;`,
  postgres: `
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  embedding_json TEXT,
  embedding vector(1536),
  source TEXT,
  confidence INTEGER DEFAULT 100,
  confidence_level TEXT DEFAULT 'certain',
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
);

CREATE INDEX IF NOT EXISTS memories_project_idx ON memories(project_id);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);
CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS memories_content_trgm_idx ON memories USING GIN (content gin_trgm_ops);`,
};
