/**
 * Memory Merge Proposals Table Schema
 * SQLite and PostgreSQL definitions
 */

export const memoryMergeProposalsTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS memory_merge_proposals (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  similarity REAL,
  merge_strategy TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
  resolved_at INTEGER,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS merge_proposals_source_idx ON memory_merge_proposals(source_memory_id);
CREATE INDEX IF NOT EXISTS merge_proposals_target_idx ON memory_merge_proposals(target_memory_id);
CREATE INDEX IF NOT EXISTS merge_proposals_status_idx ON memory_merge_proposals(status);`,
  postgres: `
CREATE TABLE IF NOT EXISTS memory_merge_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  similarity REAL,
  merge_strategy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS merge_proposals_source_idx ON memory_merge_proposals(source_memory_id);
CREATE INDEX IF NOT EXISTS merge_proposals_target_idx ON memory_merge_proposals(target_memory_id);
CREATE INDEX IF NOT EXISTS merge_proposals_status_idx ON memory_merge_proposals(status);`,
};