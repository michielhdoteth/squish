/**
 * Beliefs table migrations
 * Uses schema definitions to generate migrations
 * 
 * For existing databases without beliefs table (pre-v1.2.0), creates the table.
 * Then runs column migrations for all belief-related tables.
 */

import type { Database } from 'better-sqlite3';
import { migrateTable } from '../schema/generator.js';
import { beliefsSchema, beliefMemorySourcesSchema, beliefEdgesSchema } from '../schema/beliefs.js';
import { logger } from '../../core/logger.js';

export async function runBeliefMigrations(sqlite: Database): Promise<void> {
  // Check if beliefs table exists at all (for existing databases pre-v1.2.0)
  const beliefsCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='beliefs'"
  ).get() as { name: string } | undefined;

  if (!beliefsCheck) {
    // Create beliefs table for existing databases upgrading to v1.2.0
    logger.info('Migration: Creating beliefs table for existing database');
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS beliefs (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          belief_type TEXT NOT NULL,
          statement TEXT NOT NULL,
          normalized_key TEXT NOT NULL,
          confidence REAL DEFAULT 0.5,
          belief_decay_rate INTEGER DEFAULT 30,
          last_confirmed_at INTEGER,
          source_count INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          reason TEXT,
          context TEXT,
          evidence_summary TEXT,
          metadata TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          UNIQUE(project_id, normalized_key)
        )
      `);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Migration: Could not create beliefs table: ${msg}`);
    }
  }

  const beliefSourcesCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='belief_memory_sources'"
  ).get() as { name: string } | undefined;

  if (!beliefSourcesCheck) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS belief_memory_sources (
        id TEXT PRIMARY KEY,
        belief_id TEXT,
        memory_id TEXT,
        created_at INTEGER,
        UNIQUE(belief_id, memory_id)
      )
    `);
  }

  const beliefEdgesCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='belief_edges'"
  ).get() as { name: string } | undefined;

  if (!beliefEdgesCheck) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS belief_edges (
        id TEXT PRIMARY KEY,
        from_belief_id TEXT,
        to_belief_id TEXT,
        edge_type TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER,
        UNIQUE(from_belief_id, to_belief_id, edge_type)
      )
    `);
  }

  // Run column migrations - adds missing columns to existing tables
  await migrateTable(sqlite, beliefsSchema);
  await migrateTable(sqlite, beliefMemorySourcesSchema);
  await migrateTable(sqlite, beliefEdgesSchema);
}
