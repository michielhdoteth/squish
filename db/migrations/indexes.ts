/**
 * Learnings index migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runIndexMigrations(sqlite: Database): Promise<void> {
  const learningsTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='learnings'"
  ).get() as { name: string } | undefined;

  if (!learningsTableCheck) return;

  const existingIndexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='learnings'").all() as Array<{ name: string }>;
  const existingIndexNames = new Set(existingIndexes.map(idx => idx.name));

  const indexMigrations = [
    { name: 'learnings_folder_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_folder_idx ON learnings(folder_path)' },
    { name: 'learnings_relevance_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_relevance_idx ON learnings(relevance_score)' },
    { name: 'learnings_private_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_private_idx ON learnings(is_private)' },
    { name: 'learnings_memory_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_memory_idx ON learnings(memory_id)' },
  ];

  for (const idx of indexMigrations) {
    if (!existingIndexNames.has(idx.name)) {
      try {
        sqlite.exec(idx.sql);
        logger.info(`Migration: Added index ${idx.name} to learnings table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Index migration note for ${idx.name}: ${msg}`);
      }
    }
  }
}