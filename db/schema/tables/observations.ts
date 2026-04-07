/**
 * Observations Table Schema
 * SQLite and PostgreSQL definitions
 */

export const observationsTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  observation_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  metadata TEXT,
  is_archived INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_project_idx ON observations(project_id);
CREATE INDEX IF NOT EXISTS observations_type_idx ON observations(observation_type);
CREATE INDEX IF NOT EXISTS observations_created_idx ON observations(created_at);`,
  postgres: `
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  observation_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  metadata JSONB,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_project_idx ON observations(project_id);
CREATE INDEX IF NOT EXISTS observations_type_idx ON observations(observation_type);
CREATE INDEX IF NOT EXISTS observations_created_idx ON observations(created_at);`,
};