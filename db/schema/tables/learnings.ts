/**
 * Learnings Table Schema
 * SQLite and PostgreSQL definitions
 */

export const learningsTable = {
  sqlite: `
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
CREATE INDEX IF NOT EXISTS learnings_created_idx ON learnings(created_at);
CREATE INDEX IF NOT EXISTS learnings_memory_idx ON learnings(memory_id);`,
  postgres: `
CREATE TABLE IF NOT EXISTS learnings (
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
  folder_path TEXT,
  project_path TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  has_secrets BOOLEAN DEFAULT FALSE,
  relevance_score INTEGER DEFAULT 50,
  category TEXT,
  importance INTEGER DEFAULT 50,
  metadata JSONB,
  is_imported BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS learnings_project_idx ON learnings(project_id);
CREATE INDEX IF NOT EXISTS learnings_type_idx ON learnings(type);
CREATE INDEX IF NOT EXISTS learnings_action_idx ON learnings(action);
CREATE INDEX IF NOT EXISTS learnings_created_idx ON learnings(created_at);
CREATE INDEX IF NOT EXISTS learnings_memory_idx ON learnings(memory_id);`,
};
