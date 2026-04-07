/**
 * Memory Merge History Table Schema
 * SQLite and PostgreSQL definitions
 */

export const memoryMergeHistoryTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS memory_merge_history (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
  target_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  merge_timestamp INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  merge_reason TEXT,
  tokens_saved INTEGER DEFAULT 0,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS merge_history_target_idx ON memory_merge_history(target_memory_id);
CREATE INDEX IF NOT EXISTS merge_history_timestamp_idx ON memory_merge_history(merge_timestamp);`,
  postgres: `
CREATE TABLE IF NOT EXISTS memory_merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  target_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  merge_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  merge_reason TEXT,
  tokens_saved INTEGER DEFAULT 0,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS merge_history_target_idx ON memory_merge_history(target_memory_id);
CREATE INDEX IF NOT EXISTS merge_history_timestamp_idx ON memory_merge_history(merge_timestamp);`,
};