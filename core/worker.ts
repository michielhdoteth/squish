/**
 * Background Worker
 * Handles lifecycle maintenance, summarization, and other async tasks
 */

import { config } from '../config.js';
import { runLifecycleMaintenance } from './lifecycle.js';
import { pruneWeakAssociations, getAssociationStats } from './associations.js';
import { pruneOldSummaries, getSummarizationStats } from './summarization.js';
import { logger } from './logger.js';

interface WorkerConfig {
  lifecycleInterval: number;
  pruningInterval: number;
  summarizationCheckInterval: number;
  associationPruningThreshold: number;
  summaryPruningAge: number;
}

const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  lifecycleInterval: config.lifecycleInterval || 3600000,
  pruningInterval: 7 * 24 * 60 * 60 * 1000,
  summarizationCheckInterval: 5 * 60 * 1000,
  associationPruningThreshold: 5,
  summaryPruningAge: 30,
};

class SquishWorker {
  private lifecycleTimer?: NodeJS.Timeout;
  private pruningTimer?: NodeJS.Timeout;
  private summarizationTimer?: NodeJS.Timeout;
  private config: WorkerConfig;
  private isRunning: boolean = false;
  private stats = {
    lifecycleRuns: 0,
    pruningRuns: 0,
    summarizationRuns: 0,
    lastLifecycle: null as any,
    lastAssociation: null as any,
    lastSummarization: null as any,
  };

  constructor(customConfig: Partial<WorkerConfig> = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...customConfig };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting background worker');

    if (config.lifecycleEnabled) {
      this.scheduleLifecycleMaintenance();
    }

    this.schedulePruning();

    if (config.summarizationEnabled) {
      this.scheduleSummarizationCheck();
    }

    logger.info('Background worker started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.lifecycleTimer) clearInterval(this.lifecycleTimer);
    if (this.pruningTimer) clearInterval(this.pruningTimer);
    if (this.summarizationTimer) clearInterval(this.summarizationTimer);

    logger.info('Background worker stopped');
  }

  private scheduleLifecycleMaintenance(): void {
    this.runLifecycleMaintenance().catch((err) => {
      logger.error('Initial lifecycle maintenance failed:', err);
    });

    this.lifecycleTimer = setInterval(() => {
      this.runLifecycleMaintenance().catch((err) => {
        logger.error('Scheduled lifecycle maintenance failed:', err);
      });
    }, this.config.lifecycleInterval);
  }

  private async runLifecycleMaintenance(): Promise<void> {
    try {
      const stats = await runLifecycleMaintenance();
      this.stats.lifecycleRuns++;
      this.stats.lastLifecycle = {
        timestamp: new Date().toISOString(),
        ...stats,
      };

      logger.info('Lifecycle maintenance completed', {
        decayed: stats.decayed,
        evicted: stats.evicted,
        promoted: stats.promoted,
      });
    } catch (error) {
      logger.error('Lifecycle maintenance error:', error);
    }
  }

  private schedulePruning(): void {
    this.runPruning().catch((err) => {
      logger.error('Initial pruning failed:', err);
    });

    this.pruningTimer = setInterval(() => {
      this.runPruning().catch((err) => {
        logger.error('Scheduled pruning failed:', err);
      });
    }, this.config.pruningInterval);
  }

  private async runPruning(): Promise<void> {
    try {
      this.stats.pruningRuns++;

      const prunedAssociations = await pruneWeakAssociations(
        this.config.associationPruningThreshold
      );

      const assocStats = await getAssociationStats();
      this.stats.lastAssociation = {
        timestamp: new Date().toISOString(),
        pruned: prunedAssociations,
        ...assocStats,
      };

      const prunedSummaries = await pruneOldSummaries(this.config.summaryPruningAge);

      logger.info('Pruning completed', {
        associationsPruned: prunedAssociations,
        summariesPruned: prunedSummaries,
      });
    } catch (error) {
      logger.error('Pruning error:', error);
    }
  }

  private scheduleSummarizationCheck(): void {
    this.summarizationTimer = setInterval(() => {
      this.runSummarizationCheck().catch((err) => {
        logger.error('Summarization check failed:', err);
      });
    }, this.config.summarizationCheckInterval);
  }

  private async runSummarizationCheck(): Promise<void> {
    try {
      this.stats.summarizationRuns++;
      const stats = await getSummarizationStats();
      this.stats.lastSummarization = {
        timestamp: new Date().toISOString(),
        ...stats,
      };
    } catch (error) {
      logger.error('Summarization check error:', error);
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      stats: this.stats,
      config: this.config,
    };
  }

  async forceLifecycleMaintenance(projectId?: string): Promise<any> {
    return await runLifecycleMaintenance(projectId);
  }

  async forcePruning(): Promise<any> {
    return await this.runPruning();
  }
}

let globalWorker: SquishWorker | null = null;

export function getWorker(customConfig?: Partial<WorkerConfig>): SquishWorker {
  if (!globalWorker) {
    globalWorker = new SquishWorker(customConfig);
  }
  return globalWorker;
}

export async function startWorker(): Promise<void> {
  const worker = getWorker();
  await worker.start();
}

export async function stopWorker(): Promise<void> {
  if (globalWorker) {
    await globalWorker.stop();
  }
}

export function getWorkerStats() {
  if (!globalWorker) {
    return null;
  }
  return globalWorker.getStats();
}

export async function forceLifecycleMaintenance(projectId?: string): Promise<any> {
  const worker = getWorker();
  return await worker.forceLifecycleMaintenance(projectId);
}

export async function forcePruning(): Promise<any> {
  const worker = getWorker();
  return await worker.forcePruning();
}

export type { WorkerConfig };
export { SquishWorker };
