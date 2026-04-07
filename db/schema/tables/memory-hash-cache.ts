/**
 * Memory Hash Cache Table Schema
 * SQLite and PostgreSQL definitions
 */

export const memoryHashCacheTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS memory_hash_cache (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  content_preview TEXT,
  last_validated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS hash_cache_memory_idx ON memory_hash_cache(memory_id);
CREATE INDEX IF NOT EXISTS hash_cache_hash_idx ON memory_hash_cache(content_hash);`,
  postgres: `
CREATE TABLE IF NOT EXISTS memory_hash_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  content_preview TEXT,
  last_validated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS hash_cache_memory_idx ON memory_hash_cache(memory_id);
CREATE INDEX IF NOT EXISTS hash_cache_hash_idx ON memory_hash_cache(content_hash);`,
};