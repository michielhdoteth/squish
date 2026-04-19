/**
 * Learnings table migrations
 * Uses schema definitions to generate migrations
 */

import type { Database } from 'better-sqlite3';
import { migrateTable } from '../schema/generator.js';
import { learningsSchema } from '../schema/learnings.js';
import { logger } from '../../core/logger.js';

export async function runLearningsMigrations(sqlite: Database): Promise<void> {
  // Handle table rename: observations -> learnings
  const observationsCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='observations'"
  ).get() as { name: string } | undefined;

  const learningsCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='learnings'"
  ).get() as { name: string } | undefined;

  if (observationsCheck && !learningsCheck) {
    try {
      sqlite.exec("ALTER TABLE observations RENAME TO learnings");
      logger.info('Migration: Renamed observations table to learnings');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Migration: Could not rename observations to learnings: ${msg}`);
    }
  }

  if (!learningsCheck) return;

  await migrateTable(sqlite, learningsSchema);
}