/** Cron Scheduler - Persistent cron-based job scheduling with fallback support */

import cron from 'node-cron';
import { selfIterationHandler } from '../sessions/self-iteration-job.js';
import { logger } from '../logger.js';
import { config } from '../../config.js';
import { getDb } from '../../db/index.js';
import { maintenanceJobs, maintenanceJobHistory } from '../../drizzle/schema-sqlite.js';
import { eq } from 'drizzle-orm';

export type JobType = 'nightly' | 'weekly' | 'hourly';
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

    const jobs = await db
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
      cronExpression: '30 * * * *',  // Run every hour at :30
      enabled: true,
      jobConfig: { minMessageCount: 5, maxMessagesToProcess: 50 },
    },
  ];

  for (const job of defaultJobs) {
    const existing = await db
      .select()
      .from(maintenanceJobs)
      .where(eq(maintenanceJobs.jobName, job.jobName))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(maintenanceJobs).values({
        ...job,
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
      });
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
    scheduled: true,
    timezone: 'UTC',
  });

  activeTasks.set(job.jobName, task);

  const nextRun = getNextRunTime(job.cronExpression);
  const db = await getDb();
  if (db) {
    await db
      .update(maintenanceJobs)
      .set({ nextRunAt: nextRun })
      .where(eq(maintenanceJobs.id, job.id));
  }

  logger.info(`[Scheduler] Scheduled ${job.jobName} with cron: ${job.cronExpression}, next run: ${nextRun?.toISOString()}`);
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
    const [currentJob] = await db
      .select()
      .from(maintenanceJobs)
      .where(eq(maintenanceJobs.id, job.id));

    await db
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

    await db.insert(maintenanceJobHistory).values({
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

    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      const next = new Date(now);
      next.setHours(parseInt(parts[1]), parseInt(parts[0]), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

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

  const jobs = await db.select().from(maintenanceJobs);
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
  const jobs = await db.select().from(maintenanceJobs);

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
