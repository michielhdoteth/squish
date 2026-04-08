/**
 * Memory Associations Table Schema
 * SQLite and PostgreSQL definitions
 */

export const memoryAssociationsTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS memory_associations (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  associated_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  association_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  coactivation_count INTEGER DEFAULT 0,
  last_coactivated_at INTEGER,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS associations_memory_idx ON memory_associations(memory_id);
CREATE INDEX IF NOT EXISTS associations_associated_idx ON memory_associations(associated_memory_id);
CREATE INDEX IF NOT EXISTS associations_type_idx ON memory_associations(association_type);`,
  postgres: `
CREATE TABLE IF NOT EXISTS memory_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  associated_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  association_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  coactivation_count INTEGER DEFAULT 0,
  last_coactivated_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS associations_memory_idx ON memory_associations(memory_id);
CREATE INDEX IF NOT EXISTS associations_associated_idx ON memory_associations(associated_memory_id);
CREATE INDEX IF NOT EXISTS associations_type_idx ON memory_associations(association_type);`,
};
