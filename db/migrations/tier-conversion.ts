/**
 * Tier conversion migration
 * Converts deprecated 'warm' tier memories to 'cold'
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runTierConversion(sqlite: Database): Promise<void> {
  const warmMemories = sqlite.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE tier = 'warm'"
  ).get() as { count: number } | undefined;

  if (warmMemories && warmMemories.count > 0) {
    logger.info(`Migration: Converting ${warmMemories.count} warm-tiered memories to cold`);
    try {
      sqlite.exec("UPDATE memories SET tier = 'cold' WHERE tier = 'warm'");
      logger.info('Migration: Tier conversion complete (warm -> cold)');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Migration: Could not convert warm tier: ${msg}`);
    }
  }
}
