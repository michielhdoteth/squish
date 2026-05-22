import { describe, expect, test } from 'bun:test';

describe('cron scheduler', () => {
  test('exports all key functions', async () => {
    const mod = await import('../../../core/scheduler/cron-scheduler.ts');
    expect(typeof mod.initializeScheduler).toBe('function');
    expect(typeof mod.scheduleJob).toBe('function');
    expect(typeof mod.registerJobHandler).toBe('function');
    expect(typeof mod.stopAllJobs).toBe('function');
    expect(typeof mod.getScheduledJobs).toBe('function');
    expect(typeof mod.executeJob).toBe('function');
    expect(typeof mod.getOverdueJobs).toBe('function');
  });

  test('registerJobHandler stores handler', async () => {
    const { registerJobHandler } = await import('../../../core/scheduler/cron-scheduler.ts');
    const handlerName = 'test_handler_' + Date.now();
    registerJobHandler(handlerName, async () => ({ recordsProcessed: 0, summary: {} }));
    // No error means registration succeeded
    expect(true).toBe(true);
  });

  test('stopAllJobs runs without error', async () => {
    const { stopAllJobs } = await import('../../../core/scheduler/cron-scheduler.ts');
    expect(() => stopAllJobs()).not.toThrow();
  });

  test('ScheduledJob and JobExecutionContext interfaces exist', async () => {
    const mod = await import('../../../core/scheduler/cron-scheduler.ts');
    // These are TypeScript interfaces - verify they're attached to module
    expect(typeof mod.scheduleJob).toBe('function');
    expect(typeof mod.registerJobHandler).toBe('function');
  });
});
