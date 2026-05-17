/**
 * Memory Lifecycle Management
 *
 * Decay has been migrated to the Ebbinghaus engine in core/decay/decay-engine.ts.
 * This file retains the LifecycleStats interface and runLifecycleMaintenance entry point
 * for backward compatibility with the cron scheduler and other callers.
 *
 * Decay migrated to Ebbinghaus engine in core/decay/decay-engine.ts
 */

import { config } from '../config.js';
import { logger } from './logger.js';

export interface LifecycleStats {
  decayed: number;
  evicted: number;
  promoted: number;
  expired: number;
}

/**
 * Run full lifecycle maintenance on all memories
 *
 * Note: Decay scoring has been migrated to the Ebbinghaus engine (core/decay/decay-engine.ts).
 * The cron scheduler's decay_maintenance job now calls updateAllDecayScores() directly.
 * This function is kept for backward compatibility and returns empty stats.
 */
export async function runLifecycleMaintenance(projectId?: string): Promise<LifecycleStats> {
  if (!config.lifecycleEnabled) {
    return { decayed: 0, evicted: 0, promoted: 0, expired: 0 };
  }

  // Decay scoring, tier updates, and eviction are now handled by:
  // - core/decay/decay-engine.ts (Ebbinghaus power-law decay)
  // - core/scheduler/cron-scheduler.ts (decay_maintenance cron job, runs hourly)
  // Sector-based decay (applyDecay) and eviction (evictOldMemories) have been removed.
  logger.info('Lifecycle maintenance: decay handled by Ebbinghaus engine');

  return { decayed: 0, evicted: 0, promoted: 0, expired: 0 };
}




