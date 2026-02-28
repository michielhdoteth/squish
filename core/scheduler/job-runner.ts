/** Job Runner - Maintenance job implementations */

import { logger } from '../logger.js';
import { type JobExecutionContext } from './cron-scheduler.js';
import { runDeduplicationJob } from '../consolidation.js';
import { runLifecycleMaintenance } from '../lifecycle.js';
import { pruneWeakAssociations } from '../associations.js';
import { pruneOldSummaries } from '../summarization.js';
import { getDb } from '../../db/index.js';
import { memories, memoryFeedback } from '../../drizzle/schema-sqlite.js';
import { eq, and, gt, lt } from 'drizzle-orm';

export async function runNightlyJob(context: JobExecutionContext): Promise<{
  recordsProcessed: number;
  summary: Record<string, unknown>;
}> {
  const summary: Record<string, unknown> = {};
  let recordsProcessed = 0;

  logger.info('[NightlyJob] Starting nightly maintenance');

  if (context.config.applyDecay !== false || context.config.updateTiers !== false) {
    try {
      const lifecycleResult = await runLifecycleMaintenance();
      summary.decayApplied = lifecycleResult?.decayed || 0;
      summary.tiersUpdated = (lifecycleResult?.tierChanges?.hot || 0) +
                            (lifecycleResult?.tierChanges?.warm || 0) +
                            (lifecycleResult?.tierChanges?.cold || 0);
      recordsProcessed += summary.decayApplied as number;
      recordsProcessed += summary.tiersUpdated as number;
      logger.info(`[NightlyJob] Lifecycle: ${summary.decayApplied} decayed, ${summary.tiersUpdated} tier updates`);
    } catch (error) {
      logger.error('[NightlyJob] Lifecycle maintenance failed:', error);
      summary.lifecycleError = error instanceof Error ? error.message : String(error);
    }
  }

  if (context.config.mergeDuplicates !== false) {
    try {
      const dedupResult = await runDeduplicationJob();
      summary.duplicatesMerged = dedupResult?.mergedCount || 0;
      recordsProcessed += summary.duplicatesMerged as number;
      logger.info(`[NightlyJob] Merged ${summary.duplicatesMerged} duplicate memories`);
    } catch (error) {
      logger.error('[NightlyJob] Deduplication failed:', error);
      summary.dedupError = error instanceof Error ? error.message : String(error);
    }
  }

  if (context.config.boostAccessed !== false) {
    try {
      const boostResult = await boostFrequentlyAccessed();
      summary.memoriesBoosted = boostResult;
      recordsProcessed += boostResult;
      logger.info(`[NightlyJob] Boosted ${summary.memoriesBoosted} frequently accessed memories`);
    } catch (error) {
      logger.error('[NightlyJob] Boost failed:', error);
      summary.boostError = error instanceof Error ? error.message : String(error);
    }
  }

  logger.info(`[NightlyJob] Completed: ${recordsProcessed} records processed`);

  return { recordsProcessed, summary };
}

export async function runWeeklyJob(context: JobExecutionContext): Promise<{
  recordsProcessed: number;
  summary: Record<string, unknown>;
}> {
  const summary: Record<string, unknown> = {};
  let recordsProcessed = 0;

  logger.info('[WeeklyJob] Starting weekly maintenance');

  if (context.config.archiveStale !== false) {
    try {
      const archiveResult = await archiveStaleMemories(90);
      summary.memoriesArchived = archiveResult;
      recordsProcessed += archiveResult;
      logger.info(`[WeeklyJob] Archived ${summary.memoriesArchived} stale memories`);
    } catch (error) {
      logger.error('[WeeklyJob] Archive failed:', error);
      summary.archiveError = error instanceof Error ? error.message : String(error);
    }
  }

  if (context.config.pruneAssociations !== false) {
    try {
      const pruneResult = await pruneWeakAssociations();
      summary.associationsPruned = typeof pruneResult === 'number' ? pruneResult : 0;
      recordsProcessed += summary.associationsPruned as number;
      logger.info(`[WeeklyJob] Pruned ${summary.associationsPruned} weak associations`);
    } catch (error) {
      logger.error('[WeeklyJob] Association pruning failed:', error);
      summary.pruneError = error instanceof Error ? error.message : String(error);
    }
  }

  if (context.config.pruneSummaries !== false) {
    try {
      const summaryPruneResult = await pruneOldSummaries(30);
      summary.summariesPruned = typeof summaryPruneResult === 'number' ? summaryPruneResult : 0;
      recordsProcessed += summary.summariesPruned as number;
      logger.info(`[WeeklyJob] Pruned ${summary.summariesPruned} old summaries`);
    } catch (error) {
      logger.error('[WeeklyJob] Summary pruning failed:', error);
      summary.summaryPruneError = error instanceof Error ? error.message : String(error);
    }
  }

  if (context.config.cleanupFeedback !== false) {
    try {
      const feedbackCleanupResult = await cleanupOldFeedbackRecords(30);
      summary.feedbackRecordsCleaned = feedbackCleanupResult;
      recordsProcessed += feedbackCleanupResult;
      logger.info(`[WeeklyJob] Cleaned ${summary.feedbackRecordsCleaned} old feedback records`);
    } catch (error) {
      logger.error('[WeeklyJob] Feedback cleanup failed:', error);
      summary.feedbackError = error instanceof Error ? error.message : String(error);
    }
  }

  logger.info(`[WeeklyJob] Completed: ${recordsProcessed} records processed`);

  return { recordsProcessed, summary };
}

async function boostFrequentlyAccessed(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const frequentlyAccessed = await db
    .select()
    .from(memories)
    .where(gt(memories.accessCount, 3));

  let boosted = 0;
  for (const memory of frequentlyAccessed) {
    const currentPriority = memory.retrievalPriority ?? 50;
    const newPriority = Math.min(100, currentPriority + 5);

    await db
      .update(memories)
      .set({ retrievalPriority: newPriority })
      .where(eq(memories.id, memory.id));

    boosted++;
  }

  return boosted;
}

async function archiveStaleMemories(daysOld: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const staleThreshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const staleMemories = await db
    .select()
    .from(memories)
    .where(and(
      lt(memories.lastAccessedAt, staleThreshold),
      lt(memories.importanceScore, 30),
      eq(memories.isProtected, false),
      eq(memories.isPinned, false)
    ));

  let archived = 0;
  for (const memory of staleMemories) {
    await db
      .update(memories)
      .set({ tier: 'cold' })
      .where(eq(memories.id, memory.id));

    archived++;
  }

  return archived;
}

async function cleanupOldFeedbackRecords(daysOld: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const oldThreshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  await db
    .delete(memoryFeedback)
    .where(lt(memoryFeedback.createdAt, oldThreshold));

  return 0;
}
