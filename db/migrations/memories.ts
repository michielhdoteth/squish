/**
 * Memories table migrations
 * Uses schema definitions to generate migrations
 */

import type { Database } from 'better-sqlite3';
import { migrateTable } from '../schema/generator.js';
import { memoriesSchema } from '../schema/memories.js';
import { logger } from '../../core/logger.js';

export async function runMemoriesMigrations(sqlite: Database): Promise<void> {
  const tableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'"
  ).get() as { name: string } | undefined;

  if (!tableCheck) {
    logger.debug('Memories table does not exist yet, skipping migrations');
    return;
  }

  await migrateTable(sqlite, memoriesSchema);
}