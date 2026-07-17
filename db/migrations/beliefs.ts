/**
 * Beliefs table migrations (LEGACY)
 * 
 * Creates beliefs/belief_memory_sources/belief_edges tables for databases
 * upgrading from pre-v1.2.0. These tables are kept for backward compatibility
 * but active belief data now lives in the unified 'knowledge' table.
 * 
 * NOTE: This migration is NOT called from runAllMigrations().
 * It exists only for direct invocation if needed.
 */

import type { Database } from 'better-sqlite3';
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

  // Note: Column migrations for beliefs tables are no longer needed.
  // Belief data is managed via the unified 'knowledge' table (core/knowledge/).
}
