/**
 * Messages Table Schema
 * SQLite and PostgreSQL definitions
 */

export const messagesTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT,
  embedding BLOB,
  token_count INTEGER,
  tool_calls TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_role_idx ON messages(role);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);`,
  postgres: `
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT,
  embedding vector(1536),
  token_count INTEGER,
  tool_calls JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_role_idx ON messages(role);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);`,
};