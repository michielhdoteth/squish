/**
 * Entities table migrations
 * Adds missing columns for graph auto-build (mention_count, last_mentioned_at, aliases)
 * These columns are used by relationship-extractor.ts and entity-deduplicator.ts
 * but were never added to the original schema.
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runEntitiesMigrations(sqlite: Database): Promise<void> {
  // Add mention_count column if missing
  try {
    sqlite.exec(`ALTER TABLE entities ADD COLUMN mention_count INTEGER DEFAULT 0`);
    logger.info('Migration: Added mention_count to entities');
  } catch (error: any) {
    if (!error.message?.includes('duplicate column')) {
      logger.warn(`Migration: entities.mention_count: ${error.message}`);
    }
  }

  // Add last_mentioned_at column if missing
  try {
    sqlite.exec(`ALTER TABLE entities ADD COLUMN last_mentioned_at INTEGER`);
    logger.info('Migration: Added last_mentioned_at to entities');
  } catch (error: any) {
    if (!error.message?.includes('duplicate column')) {
      logger.warn(`Migration: entities.last_mentioned_at: ${error.message}`);
    }
  }

  // Add aliases column if missing
  try {
    sqlite.exec(`ALTER TABLE entities ADD COLUMN aliases TEXT`);
    logger.info('Migration: Added aliases to entities');
  } catch (error: any) {
    if (!error.message?.includes('duplicate column')) {
      logger.warn(`Migration: entities.aliases: ${error.message}`);
    }
  }
}
