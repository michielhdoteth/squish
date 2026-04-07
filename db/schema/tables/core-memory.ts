/**
 * Core Memory Table Schema
 * SQLite and PostgreSQL definitions
 */

export const coreMemoryTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS core_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT,
  embedding BLOB,
  importance INTEGER DEFAULT 50,
  metadata TEXT,
  tokens_estimate INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS core_memory_project_idx ON core_memory(project_id);
CREATE INDEX IF NOT EXISTS core_memory_type_idx ON core_memory(memory_type);`,
  postgres: `
CREATE TABLE IF NOT EXISTS core_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT,
  embedding vector(1536),
  importance INTEGER DEFAULT 50,
  metadata JSONB,
  tokens_estimate INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS core_memory_project_idx ON core_memory(project_id);
CREATE INDEX IF NOT EXISTS core_memory_type_idx ON core_memory(memory_type);`,
};