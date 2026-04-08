/**
 * Entities Table Schema
 * SQLite and PostgreSQL definitions
 */

export const entitiesTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT,
  aliases TEXT,
  metadata TEXT,
  last_mentioned_at INTEGER,
  mention_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_project_idx ON entities(project_id);
CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(name);`,
  postgres: `
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT,
  aliases TEXT[],
  metadata JSONB,
  last_mentioned_at TIMESTAMPTZ,
  mention_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_project_idx ON entities(project_id);
CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(name);`,
};