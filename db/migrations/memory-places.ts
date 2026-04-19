/**
 * Memory places table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runMemoryPlacesMigrations(sqlite: Database): Promise<void> {
  const memoryPlacesTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_places'"
  ).get() as { name: string } | undefined;

  if (!memoryPlacesTableCheck) return;

  const memoryPlacesInfo = sqlite.prepare("PRAGMA table_info(memory_places)").all() as Array<{ name: string }>;
  const existingMemoryPlacesColumns = new Set(memoryPlacesInfo.map(col => col.name));

  const memoryPlacesMigrations = [
    { col: 'place_sort_order', sql: 'ALTER TABLE memory_places ADD COLUMN place_sort_order INTEGER DEFAULT 0' },
  ];

  for (const migration of memoryPlacesMigrations) {
    if (!existingMemoryPlacesColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to memory_places table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('duplicate column name')) {
          logger.warn(`Migration note for memory_places.${migration.col}: ${msg}`);
        }
      }
    }
  }
}