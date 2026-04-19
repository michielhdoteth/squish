/**
 * Places table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runPlacesMigrations(sqlite: Database): Promise<void> {
  const placesTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='places'"
  ).get() as { name: string } | undefined;

  if (!placesTableCheck) return;

  const placesInfo = sqlite.prepare("PRAGMA table_info(places)").all() as Array<{ name: string }>;
  const placesColumns = new Set(placesInfo.map(col => col.name));

  const placesMigrations = [
    { col: 'sort_order', sql: 'ALTER TABLE places ADD COLUMN sort_order INTEGER DEFAULT 0' },
    { col: 'loci_index', sql: '' },
  ];

  for (const migration of placesMigrations) {
    if (migration.col === 'loci_index') {
      if (placesColumns.has('loci_index') && !placesColumns.has('sort_order')) {
        try {
          sqlite.exec("UPDATE places SET sort_order = loci_index WHERE sort_order = 0 OR sort_order IS NULL");
          logger.info('Migration: Copied loci_index data to sort_order');
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`Migration: Could not copy loci_index data: ${errMsg}`);
        }
      }
      continue;
    }

    if (!placesColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to places table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('duplicate column name')) {
          throw new Error(`Migration failed for places.${migration.col}: ${msg}`);
        }
      }
    }
  }
}