import cron from 'node-cron';
import { config } from '../../config.js';
import { logger } from '../../core/logger.js';
import { getDb } from '../../db/index.js';
import { memories } from '../../drizzle/schema.js';
import { eq, lt, and } from 'drizzle-orm';

/**
 * Simple decay scheduler that runs according to `config.decayJobCron`.
 * It applies a multiplicative decay to the `importanceScore` of each memory
 * based on its `decay_rate` column. When the score falls below `config.decayThreshold`
 * the memory is demoted to the next tier or marked as expired.
 */
export async function startDecayScheduler() {
  if (!config.cronEnabled) {
    logger.info('[Decay] Cron disabled – scheduler not started');
    return;
  }
  const expr = config.decayJobCron;
  if (!cron.validate(expr)) {
    logger.warn(`[Decay] Invalid cron expression '${expr}' – scheduler not started`);
    return;
  }
  cron.schedule(expr, async () => {
    try {
      const db = await getDb();
      const now = new Date();
      // Fetch memories that are not protected and not already expired
       // @ts-ignore - drizzle type variance
       const rows = await db.select().from(memories).where(eq(memories.isProtected, false));
      for (const mem of rows) {
        const last = new Date(mem.lastDecayAt ?? mem.createdAt ?? now);
        const days = Math.max(1, Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)));
        const decayRate = Number(mem.decayRate ?? 0) / 100; // column stored as percent
        const newScore = (mem.importanceScore ?? 0) * Math.pow(1 - decayRate, days);
        const updates: any = { importanceScore: Math.round(newScore), lastDecayAt: now };
        if (newScore < (config.decayThreshold ?? 0.1)) {
          // demote tier or expire
          if (mem.tier === 'hot') updates.tier = 'warm';
          else if (mem.tier === 'warm') updates.tier = 'cold';
          else updates.status = 'expired';
        }
         // @ts-ignore - drizzle type variance
         await db.update(memories).set(updates).where(eq(memories.id, mem.id));
      }
      logger.info('[Decay] Decay cycle completed');
    } catch (e) {
      logger.error('[Decay] Error during decay cycle', e);
    }
  }, { timezone: 'UTC' });
  logger.info('[Decay] Scheduler initialized with expression', expr);
}
