/**
 * Core memory table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runCoreMemoryMigrations(sqlite: Database): Promise<void> {
  const coreMemoryTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='core_memory'"
  ).get() as { name: string } | undefined;

  if (!coreMemoryTableCheck) return;

  const coreMemoryInfo = sqlite.prepare("PRAGMA table_info(core_memory)").all() as Array<{ name: string }>;
  const existingCoreMemoryColumns = new Set(coreMemoryInfo.map(col => col.name));

  const coreMemoryMigrations = [
    { col: 'tokens_estimate', sql: 'ALTER TABLE core_memory ADD COLUMN tokens_estimate INTEGER DEFAULT 0 NOT NULL' },
  ];

  for (const migration of coreMemoryMigrations) {
    if (!existingCoreMemoryColumns.has(migration.col)) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: Added column ${migration.col} to core_memory table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('duplicate column name')) {
          throw new Error(`Migration failed for core_memory.${migration.col}: ${msg}`);
        }
      }
    }
  }
}