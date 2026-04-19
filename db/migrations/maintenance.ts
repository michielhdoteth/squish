/**
 * Maintenance jobs table migrations
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../../core/logger.js';

export async function runMaintenanceMigrations(sqlite: Database): Promise<void> {
  const maintenanceJobsTableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_jobs'"
  ).get() as { name: string } | undefined;

  if (!maintenanceJobsTableCheck) return;

  const maintenanceJobsInfo = sqlite.prepare("PRAGMA table_info(maintenance_jobs)").all() as Array<{ name: string }>;
  const existingMaintenanceJobsColumns = new Set(maintenanceJobsInfo.map(col => col.name));

  // Check if table has wrong schema (camelCase columns from bug in earlier version)
  const hasCamelCaseColumns = existingMaintenanceJobsColumns.has('jobName') ||
                              existingMaintenanceJobsColumns.has('jobType') ||
                              existingMaintenanceJobsColumns.has('cronExpression');

  if (hasCamelCaseColumns) {
    logger.warn('Maintenance jobs table has incorrect schema (camelCase columns). Recreating...');
    try {
      sqlite.exec('DROP TABLE IF EXISTS maintenance_jobs');
      logger.info('Dropped malformed maintenance_jobs table. It will be recreated with correct schema.');
    } catch (error) {
      logger.error('Failed to recreate maintenance_jobs table:', error);
    }
    return;
  }

  const maintenanceJobsMigrations = [
    { col: 'schedule', sql: 'ALTER TABLE maintenance_jobs DROP COLUMN schedule' },
    { col: 'cron_expression', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN cron_expression TEXT' },
    { col: 'last_run_at', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_at INTEGER' },
    { col: 'last_run_duration', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_duration INTEGER' },
    { col: 'last_run_status', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_status TEXT' },
    { col: 'last_run_error', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN last_run_error TEXT' },
    { col: 'total_runs', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN total_runs INTEGER DEFAULT 0' },
    { col: 'success_count', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN success_count INTEGER DEFAULT 0' },
    { col: 'failure_count', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN failure_count INTEGER DEFAULT 0' },
    { col: 'job_config', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN job_config TEXT' },
    { col: 'next_run_at', sql: 'ALTER TABLE maintenance_jobs ADD COLUMN next_run_at INTEGER' },
    { col: 'run_count', sql: 'ALTER TABLE maintenance_jobs DROP COLUMN run_count' },
  ];

  for (const migration of maintenanceJobsMigrations) {
    const shouldRun = migration.sql.startsWith('ALTER TABLE maintenance_jobs DROP COLUMN')
      ? existingMaintenanceJobsColumns.has(migration.col)
      : !existingMaintenanceJobsColumns.has(migration.col);

    if (shouldRun) {
      try {
        sqlite.exec(migration.sql);
        logger.info(`Migration: ${migration.col} on maintenance_jobs table`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('duplicate column name') || msg.includes('no such column')) {
          logger.debug(`Migration skipped for ${migration.col}: ${msg.includes('duplicate column name') ? 'column already exists' : 'column does not exist'}`);
        } else {
          throw new Error(`Migration failed for maintenance_jobs.${migration.col}: ${msg}`);
        }
      }
    }
  }
}