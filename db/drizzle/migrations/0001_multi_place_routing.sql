-- v1.5.0: Multi-place routing and tag-aware retrieval
-- Migration: Add primaryPlace, memoryType to memories; refactor memory_places to 1:N; create memory_tags

-- 1. Add new columns to memories table
ALTER TABLE memories ADD COLUMN primary_place TEXT;
ALTER TABLE memories ADD COLUMN memory_type TEXT;

-- 2. Backfill primaryPlace from placeType/placeId for existing memories
-- (This will be done in code, not SQL, since we need to resolve placeId -> placeType)

-- 3. Drop and recreate memory_places with new schema
-- First, create new table
CREATE TABLE IF NOT EXISTS memory_places_new (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  place_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'heuristic',
  is_primary INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);

-- Copy existing data (map placeId to placeType via places table)
INSERT INTO memory_places_new (id, memory_id, place_type, weight, source, is_primary, created_at)
SELECT
  mp.id,
  mp.memory_id,
  p.place_type,
  1.0,
  'legacy',
  1,
  mp.created_at
FROM memory_places mp
JOIN places p ON mp.place_id = p.id;

-- Drop old table
DROP TABLE IF EXISTS memory_places;

-- Rename new table
ALTER TABLE memory_places_new RENAME TO memory_places;

-- Create indexes for memory_places
CREATE INDEX IF NOT EXISTS memory_places_memory_idx ON memory_places(memory_id);
CREATE INDEX IF NOT EXISTS memory_places_place_type_idx ON memory_places(place_type);
CREATE INDEX IF NOT EXISTS memory_places_place_weight_idx ON memory_places(place_type, weight);
CREATE INDEX IF NOT EXISTS memory_places_memory_primary_idx ON memory_places(memory_id, is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS memory_places_unique ON memory_places(memory_id, place_type, source);

-- 4. Create memory_tags table
CREATE TABLE IF NOT EXISTS memory_tags (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristic',
  confidence REAL,
  created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for memory_tags
CREATE INDEX IF NOT EXISTS memory_tags_tag_idx ON memory_tags(tag);
CREATE INDEX IF NOT EXISTS memory_tags_memory_idx ON memory_tags(memory_id);
CREATE INDEX IF NOT EXISTS memory_tags_tag_memory_idx ON memory_tags(tag, memory_id);
CREATE UNIQUE INDEX IF NOT EXISTS memory_tags_unique ON memory_tags(memory_id, tag);

-- 5. Backfill memory_tags from existing memories.tags JSON
-- (This will be done in code since we need to parse JSON arrays)