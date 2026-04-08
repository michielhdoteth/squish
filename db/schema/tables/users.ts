/**
 * Users Table Schema
 * SQLite and PostgreSQL definitions
 */

export const usersTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE,
  name TEXT,
  email TEXT,
  preferences TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);`,
  postgres: `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  name TEXT,
  email TEXT,
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);`,
};
