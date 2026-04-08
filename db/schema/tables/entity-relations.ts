/**
 * Entity Relations Table Schema
 * SQLite and PostgreSQL definitions
 */

export const entityRelationsTable = {
  sqlite: `
CREATE TABLE IF NOT EXISTS entity_relations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT,
  strength REAL DEFAULT 0.5,
  created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS entity_relations_entity_idx ON entity_relations(entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_related_idx ON entity_relations(related_entity_id);`,
  postgres: `
CREATE TABLE IF NOT EXISTS entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT,
  strength REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS entity_relations_entity_idx ON entity_relations(entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_related_idx ON entity_relations(related_entity_id);`,
};