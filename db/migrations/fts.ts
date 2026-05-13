/**
 * FTS (Full-Text Search) table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runFtsMigrations(sqlite: Database): Promise<void> {
  const ftsTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
  ).get() as { name: string } | undefined;

  if (!ftsTableCheck) return;

  const ftsInfo = sqlite.prepare("PRAGMA table_info(memories_fts)").all() as Array<{ name: string }>;
  const existingFtsColumns = new Set(ftsInfo.map(col => col.name));

  // Fix: Check if EITHER summary or tags column is missing
  if (!existingFtsColumns.has('summary') || !existingFtsColumns.has('tags')) {
    logger.info('Migration: Recreating memories_fts table to add summary column...');
    try {
      sqlite.exec('DROP TRIGGER IF EXISTS memories_ai');
      sqlite.exec('DROP TRIGGER IF EXISTS memories_ad');
      sqlite.exec('DROP TRIGGER IF EXISTS memories_au');
      sqlite.exec('DROP TABLE IF EXISTS memories_fts');

      sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          content,
          tags,
          summary,
          content='memories',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, content, tags, summary)
          VALUES (new.rowid, new.content, COALESCE(new.tags, ''), COALESCE(new.summary, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
          VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''), COALESCE(old.summary, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
          VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''), COALESCE(old.summary, ''));
          INSERT INTO memories_fts(rowid, content, tags, summary)
          VALUES (new.rowid, new.content, COALESCE(new.tags, ''), COALESCE(new.summary, ''));
        END;
      `);

      logger.info('Migration: Recreated memories_fts table with summary column');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Migration: Could not recreate memories_fts table: ${msg}`);
    }
  }
}