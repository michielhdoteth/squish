/**
 * Context Sessions Table Schema
 * SQLite and PostgreSQL definitions
 */

export const contextSessionsTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS context_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  memory_ids TEXT,
  token_count INTEGER DEFAULT 0,
  started_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  ended_at INTEGER,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS context_sessions_project_idx ON context_sessions(project_id);
CREATE INDEX IF NOT EXISTS context_sessions_session_idx ON context_sessions(session_id);`,
  postgres: `
CREATE TABLE IF NOT EXISTS context_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  memory_ids TEXT[],
  token_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS context_sessions_project_idx ON context_sessions(project_id);
CREATE INDEX IF NOT EXISTS context_sessions_session_idx ON context_sessions(session_id);`,
};