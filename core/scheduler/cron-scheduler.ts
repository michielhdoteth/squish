/** Cron Scheduler - Persistent cron-based job scheduling with fallback support */

import cron from 'node-cron';
import { selfIterationHandler } from '../session/self-iteration-job.js';
import { runLifecycleMaintenance } from '../lifecycle.js';
import { logger } from '../logger.js';
import { config } from '../../config.js';
import { getDb } from '../../db/index.js';
import { maintenanceJobs, maintenanceJobHistory } from '../../db/drizzle/schema-sqlite.js';
import { eq } from 'drizzle-orm';

export type JobType = 'nightly' | 'weekly' | 'hourly' | 'daily';
export type JobStatus = 'success' | 'failed' | 'skipped';

export interface ScheduledJob {
  id: string;
  jobName: string;
  jobType: JobType;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  jobConfig: Record<string, unknown>;
}

export interface JobExecutionContext {
  jobId: string;
  jobName: string;
  jobType: JobType;
  config: Record<string, unknown>;
  startedAt: Date;
}

export type JobHandler = (context: JobExecutionContext) => Promise<{ recordsProcessed: number; summary: Record<string, unknown> }>;

const jobHandlers = new Map<string, JobHandler>();
const activeTasks = new Map<string, cron.ScheduledTask>();

export function registerJobHandler(jobName: string, handler: JobHandler): void {
  jobHandlers.set(jobName, handler);
  logger.info(`[Scheduler] Registered handler for job: ${jobName}`);
}

// Register self-iteration job handler
registerJobHandler('self_iteration', selfIterationHandler);

// Decay job handler - runs lifecycle maintenance (decay, tier updates, eviction)
const decayHandler = async (context: JobExecutionContext) => {
  const stats = await runLifecycleMaintenance();
  return {
    recordsProcessed: stats.decayed + stats.expired + stats.evicted,
    summary: {
      decayed: stats.decayed,
      expired: stats.expired,
      evicted: stats.evicted,
      tierChanges: stats.tierChanges,
    },
  };
};
registerJobHandler('decay_maintenance', decayHandler);

// Auto-clean handler - deletes stale memories automatically
const autoCleanHandler = async (context: JobExecutionContext) => {
  const { getStaleMemories, deleteMemoryPermanently } = await import('../memory/stale-cleaner.js');
  const { getAllProjects } = await import('../projects.js');
  
  const jobConfig = context.config as {
    enabled?: boolean;
    olderThanDays?: number;
    confidenceLevel?: string[];
    minImportance?: number;
    dryRun?: boolean;
  };
  
  if (jobConfig.enabled === false) {
    return { recordsProcessed: 0, summary: { skipped: true, reason: 'auto-clean disabled' } };
  }
  
  const olderThanDays = jobConfig.olderThanDays || 30;
  const confidenceLevels = jobConfig.confidenceLevel || ['outdated', 'speculative'];
  const minImportance = jobConfig.minImportance || 40;
  const dryRun = jobConfig.dryRun !== undefined ? jobConfig.dryRun : false; // Default to actual delete for safety
  
  const projects = await getAllProjects();
  let totalStale = 0;
  let totalDeleted = 0;
  
  for (const project of projects) {
    const stale = await getStaleMemories({
      olderThanDays,
      confidenceLevels,
      minImportance,
      projectId: project.id,
    });
    
    totalStale += stale.length;
    
    if (dryRun) {
      logger.info(`[AutoClean] Would delete ${stale.length} stale memories in ${project.path}`);
    } else {
      for (const memory of stale) {
        if (!memory.isPinned) {
          await deleteMemoryPermanently(memory.id);
          totalDeleted++;
        }
      }
      logger.info(`[AutoClean] Deleted ${stale.length} stale memories in ${project.path}`);
    }
  }
  
  return {
    recordsProcessed: dryRun ? totalStale : totalDeleted,
    summary: {
      mode: dryRun ? 'dry-run' : 'deleted',
      projectsScanned: projects.length,
      memoriesAffected: dryRun ? totalStale : totalDeleted,
      criteria: { olderThanDays, confidenceLevels, minImportance },
    },
  };
};
registerJobHandler('auto_clean', autoCleanHandler);

export async function initializeScheduler(): Promise<void> {
  if (!config.cronEnabled) {
    logger.info('[Scheduler] Cron scheduling disabled, using heartbeat fallback');
    return;
  }

  const db = await getDb();
  if (!db) {
    logger.warn('[Scheduler] Database not available, scheduler disabled');
    return;
  }

  try {
    await ensureDefaultJobs(db);

    const sqliteDb = db as any;
    const jobs = await sqliteDb
      .select()
      .from(maintenanceJobs)
      .where(eq(maintenanceJobs.enabled, true));

    for (const job of jobs) {
      await scheduleJob(job as unknown as ScheduledJob);
    }

    logger.info(`[Scheduler] Initialized with ${jobs.length} scheduled jobs`);
  } catch (error) {
    logger.error('[Scheduler] Failed to initialize:', error);
  }
}

async function ensureDefaultJobs(db: any): Promise<void> {
  const defaultJobs = [
    {
      jobName: 'decay_maintenance',
      jobType: 'hourly' as JobType,
      cronExpression: '0 * * * *', // Run every hour at :00
      enabled: true,
      jobConfig: { applyDecay: true, updateTiers: true, evictOld: true },
    },
    {
      jobName: 'nightly_maintenance',
      jobType: 'nightly' as JobType,
      cronExpression: '0 2 * * *',
      enabled: true,
      jobConfig: { mergeDuplicates: true, boostAccessed: true, decayScores: true },
    },
    {
      jobName: 'weekly_maintenance',
      jobType: 'weekly' as JobType,
      cronExpression: '0 3 * * 0',
      enabled: true,
      jobConfig: { regenerateSummaries: true, archiveStale: true, cleanupOrphaned: true },
    },
    {
      jobName: 'self_iteration',
      jobType: 'hourly' as JobType,
      cronExpression: '30 * * * *', // Run every hour at :30
      enabled: true,
      jobConfig: { minMessageCount: 5, maxMessagesToProcess: 50 },
    },
    {
      jobName: 'auto_clean',
      jobType: 'daily' as JobType,
      cronExpression: '0 3 * * *', // Run daily at 3 AM
      enabled: true,
      jobConfig: { 
        enabled: true,
        olderThanDays: 30,
        confidenceLevel: ['outdated', 'speculative'],
        minImportance: 40,
        dryRun: true, // Start with dry-run for safety
      },
    },
  ];

  for (const job of defaultJobs) {
    let existing;
    try {
      existing = await db
        .select()
        .from(maintenanceJobs)
        .where(eq((maintenanceJobs as any).jobName, job.jobName))
        .limit(1);
    } catch (queryError: any) {
      logger.error(`[Scheduler] Query failed for job ${job.jobName}:`, queryError.message);
      // Try raw SQL fallback
      try {
        const rawDb = (db as any).$client;
        if (rawDb && typeof rawDb.prepare === 'function') {
          existing = rawDb.prepare('SELECT * FROM maintenance_jobs WHERE job_name = ?').all(job.jobName);
        }
      } catch (fallbackError: any) {
        logger.error(`[Scheduler] Fallback query also failed:`, fallbackError.message);
        throw queryError;
      }
    }

    if (existing.length === 0) {
      try {
        await db.insert(maintenanceJobs).values({
          jobName: job.jobName,
          jobType: job.jobType,
          cronExpression: job.cronExpression,
          enabled: job.enabled,
          jobConfig: job.jobConfig,
          totalRuns: 0,
          successCount: 0,
          failureCount: 0,
          lastRunAt: null,
          nextRunAt: null,
          lastRunDuration: null,
          lastRunStatus: null,
          lastRunError: null,
        });
      } catch (insertError: any) {
        // Fallback to raw SQL if drizzle insert fails
        logger.warn(`[Scheduler] Drizzle insert failed, using raw SQL: ${insertError.message}`);
        const rawDb = (db as any).$client;
        if (rawDb && typeof rawDb.prepare === 'function') {
          const stmt = rawDb.prepare(`
            INSERT INTO maintenance_jobs 
            (id, job_name, job_type, cron_expression, enabled, job_config, 
             total_runs, success_count, failure_count, last_run_at, next_run_at, 
             last_run_duration, last_run_status, last_run_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            crypto.randomUUID(),
            job.jobName,
            job.jobType,
            job.cronExpression,
            job.enabled ? 1 : 0,
            JSON.stringify(job.jobConfig),
            0, 0, 0,
            null, null, null, null, null
          );
        }
      }
      logger.info(`[Scheduler] Created default job: ${job.jobName}`);

      // Register self-iteration handler
      if (job.jobName === 'self_iteration') {
        registerJobHandler('self_iteration', selfIterationHandler);
      }
    }
  }
}

export async function scheduleJob(job: ScheduledJob): Promise<void> {
  const existingTask = activeTasks.get(job.jobName);
  if (existingTask) {
    existingTask.stop();
    activeTasks.delete(job.jobName);
  }

  if (!job.enabled || !job.cronExpression) {
    logger.debug(`[Scheduler] Job ${job.jobName} is disabled or has no cron expression`);
    return;
  }

  if (!cron.validate(job.cronExpression)) {
    logger.error(`[Scheduler] Invalid cron expression for ${job.jobName}: ${job.cronExpression}`);
    return;
  }

  const task = cron.schedule(job.cronExpression, async () => {
    await executeJob(job);
  }, {
    timezone: 'UTC',
  });

  activeTasks.set(job.jobName, task);

  const nextRun = getNextRunTime(job.cronExpression);
  const db = await getDb();
  if (db) {
    const sqliteDb = db as any;
    await sqliteDb
      .update(maintenanceJobs)
      .set({ nextRunAt: nextRun })
      .where(eq(maintenanceJobs.id, job.id));
  }

  logger.info(`[Scheduler] Scheduled ${job.jobName} with cron: ${job.cronExpression}${nextRun ? `, next run: ${nextRun.toISOString()}` : ''}`);
}

export async function executeJob(job: ScheduledJob): Promise<void> {
  const db = await getDb();
  const handler = jobHandlers.get(job.jobName);

  if (!handler) {
    logger.warn(`[Scheduler] No handler registered for job: ${job.jobName}`);
    return;
  }

  const startedAt = new Date();
  let status: JobStatus = 'success';
  let error: string | null = null;
  let recordsProcessed = 0;
  let summary: Record<string, unknown> = {};

  try {
    logger.info(`[Scheduler] Executing job: ${job.jobName}`);

    const result = await handler({
      jobId: job.id,
      jobName: job.jobName,
      jobType: job.jobType,
      config: job.jobConfig || {},
      startedAt,
    });

    recordsProcessed = result.recordsProcessed;
    summary = result.summary;

    logger.info(`[Scheduler] Job ${job.jobName} completed: ${recordsProcessed} records processed`);
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    logger.error(`[Scheduler] Job ${job.jobName} failed:`, error);
  }

  const completedAt = new Date();

  if (db) {
    const sqliteDb = db as any;
    const [currentJob] = await sqliteDb
      .select()
      .from(maintenanceJobs)
      .where(eq(maintenanceJobs.id, job.id));

    await sqliteDb
      .update(maintenanceJobs)
      .set({
        lastRunAt: startedAt,
        lastRunStatus: status,
        lastRunError: error,
        lastRunDuration: completedAt.getTime() - startedAt.getTime(),
        totalRuns: (currentJob?.totalRuns ?? 0) + 1,
        successCount: status === 'success' ? (currentJob?.successCount ?? 0) + 1 : currentJob?.successCount,
        failureCount: status === 'failed' ? (currentJob?.failureCount ?? 0) + 1 : currentJob?.failureCount,
        nextRunAt: job.cronExpression ? getNextRunTime(job.cronExpression) : null,
      })
      .where(eq(maintenanceJobs.id, job.id));

    await sqliteDb.insert(maintenanceJobHistory).values({
      jobId: job.id,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      status,
      error,
      recordsProcessed,
      resultSummary: summary,
    });
  }
}

function getNextRunTime(cronExpression: string): Date | null {
  try {
    const now = new Date();
    const parts = cronExpression.split(' ');

    // Daily jobs: MM HH * * *
    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*' && parts[1] !== '*') {
      const next = new Date(now);
      next.setHours(parseInt(parts[1]), parseInt(parts[0]), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    // Hourly jobs: MM * * * *
    if (parts[1] === '*' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      const next = new Date(now);
      next.setMinutes(parseInt(parts[0]), 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      return next;
    }

    // Weekly jobs: MM HH * * D
    if (parts[4] !== '*') {
      const dayOfWeek = parseInt(parts[4]);
      const next = new Date(now);
      next.setHours(parseInt(parts[1]), parseInt(parts[0]), 0, 0);
      const daysUntil = (dayOfWeek - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + (daysUntil === 0 && next > now ? 7 : daysUntil));
      return next;
    }

    return null;
  } catch {
    return null;
  }
}

export async function getScheduledJobs(): Promise<ScheduledJob[]> {
  const db = await getDb();
  if (!db) return [];

  const sqliteDb = db as any;
  const jobs = await sqliteDb.select().from(maintenanceJobs);
  return jobs.map((job: typeof maintenanceJobs.$inferSelect) => ({
    id: job.id,
    jobName: job.jobName,
    jobType: job.jobType as JobType,
    cronExpression: job.cronExpression || '',
    enabled: job.enabled ?? true,
    lastRunAt: job.lastRunAt ? new Date(job.lastRunAt) : null,
    nextRunAt: job.nextRunAt ? new Date(job.nextRunAt) : null,
    jobConfig: (job.jobConfig as Record<string, unknown>) || {},
  }));
}

export async function getOverdueJobs(): Promise<ScheduledJob[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const sqliteDb = db as any;
  const jobs = await sqliteDb.select().from(maintenanceJobs);

  return jobs
    .filter((job: typeof maintenanceJobs.$inferSelect) => {
      if (!job.enabled) return false;
      if (!job.nextRunAt) return true;
      return new Date(job.nextRunAt) < now;
    })
    .map((job: typeof maintenanceJobs.$inferSelect) => ({
      id: job.id,
      jobName: job.jobName,
      jobType: job.jobType as JobType,
      cronExpression: job.cronExpression || '',
      enabled: job.enabled ?? true,
      lastRunAt: job.lastRunAt ? new Date(job.lastRunAt) : null,
      nextRunAt: job.nextRunAt ? new Date(job.nextRunAt) : null,
      jobConfig: (job.jobConfig as Record<string, unknown>) || {},
    }));
}

export function stopAllJobs(): void {
  for (const [name, task] of activeTasks) {
    task.stop();
    logger.info(`[Scheduler] Stopped job: ${name}`);
  }
  activeTasks.clear();
}
