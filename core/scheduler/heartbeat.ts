/** Heartbeat - Fallback job execution via heartbeat checking */

import { logger } from '../logger.js';
import { config } from '../../config.js';
import { getOverdueJobs, executeJob } from './cron-scheduler.js';

let lastHeartbeat: Date | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

export async function heartbeat(): Promise<{
  checked: boolean;
  overdueCount: number;
  executedJobs: string[];
}> {
  const result = {
    checked: false,
    overdueCount: 0,
    executedJobs: [] as string[],
  };

  if (config.schedulerMode === 'cron' && config.cronEnabled) {
    logger.debug('[Heartbeat] Cron mode active, skipping heartbeat check');
    return result;
  }

  lastHeartbeat = new Date();
  result.checked = true;

  try {
    const overdueJobs = await getOverdueJobs();
    result.overdueCount = overdueJobs.length;

    if (overdueJobs.length === 0) {
      logger.debug('[Heartbeat] No overdue jobs');
      return result;
    }

    logger.info(`[Heartbeat] Found ${overdueJobs.length} overdue jobs, executing...`);

    for (const job of overdueJobs) {
      try {
        await executeJob(job);
        result.executedJobs.push(job.jobName);
        logger.info(`[Heartbeat] Executed overdue job: ${job.jobName}`);
      } catch (error) {
        logger.error(`[Heartbeat] Failed to execute job ${job.jobName}:`, error);
      }
    }

    return result;
  } catch (error) {
    logger.error('[Heartbeat] Failed to check overdue jobs:', error);
    return result;
  }
}

export function startHeartbeatChecking(): void {
  if (config.schedulerMode === 'cron' && config.cronEnabled) {
    logger.info('[Heartbeat] Cron mode active, heartbeat checking disabled');
    return;
  }

  stopHeartbeatChecking();

  heartbeatInterval = setInterval(async () => {
    await heartbeat();
  }, config.heartbeatInterval);

  logger.info(`[Heartbeat] Started periodic checking (interval: ${config.heartbeatInterval}ms)`);

  heartbeat().catch(err => {
    logger.error('[Heartbeat] Initial heartbeat failed:', err);
  });
}

export function stopHeartbeatChecking(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info('[Heartbeat] Stopped periodic checking');
  }
}

export function getLastHeartbeat(): Date | null {
  return lastHeartbeat;
}

export function isHeartbeatDue(): boolean {
  if (!lastHeartbeat) return true;
  return Date.now() - lastHeartbeat.getTime() > config.heartbeatInterval;
}
