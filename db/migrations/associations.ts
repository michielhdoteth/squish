/**
 * Memory associations table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runAssociationsMigrations(sqlite: Database): Promise<void> {
  const associationsTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_associations'"
  ).get() as { name: string } | undefined;

  if (!associationsTableCheck) return;

  const associationsInfo = sqlite.prepare("PRAGMA table_info(memory_associations)").all() as Array<{ name: string }>;
  const existingAssociationsColumns = new Set(associationsInfo.map(col => col.name));

  const associationsMigrations = [
    { col: 'metadata', sql: 'ALTER TABLE memory_associations ADD COLUMN metadata TEXT' },
  ];

  for (const migration of associationsMigrations) {
    if (!existingAssociationsColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to memory_associations table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('duplicate column name')) {
          throw new Error(`Migration failed for memory_associations.${migration.col}: ${msg}`);
        }
      }
    }
  }
}