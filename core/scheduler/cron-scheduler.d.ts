/** Cron Scheduler - Persistent cron-based job scheduling with fallback support */
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
export type JobHandler = (context: JobExecutionContext) => Promise<{
    recordsProcessed: number;
    summary: Record<string, unknown>;
}>;
export declare function registerJobHandler(jobName: string, handler: JobHandler): void;
export declare function initializeScheduler(): Promise<void>;
export declare function scheduleJob(job: ScheduledJob): Promise<void>;
export declare function executeJob(job: ScheduledJob): Promise<void>;
export declare function getScheduledJobs(): Promise<ScheduledJob[]>;
export declare function getOverdueJobs(): Promise<ScheduledJob[]>;
export declare function stopAllJobs(): void;
//# sourceMappingURL=cron-scheduler.d.ts.map