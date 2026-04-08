/**
 * Namespaces Table Schema
 * SQLite and PostgreSQL definitions
 */

export const namespacesTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS namespaces (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  namespace_path TEXT,
  description TEXT,
  metadata TEXT,
  parent_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS namespaces_project_idx ON namespaces(project_id);
CREATE INDEX IF NOT EXISTS namespaces_path_idx ON namespaces(namespace_path);`,
  postgres: `
CREATE TABLE IF NOT EXISTS namespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  namespace_path TEXT,
  description TEXT,
  metadata JSONB,
  parent_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS namespaces_project_idx ON namespaces(project_id);
CREATE INDEX IF NOT EXISTS namespaces_path_idx ON namespaces(namespace_path);`,
};