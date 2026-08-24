// Memory maintenance orchestration.
//
// Batch 8: the parallel SimHash dedup engine that used to live here was
// deleted after the consolidation bake-off (docs/consolidation-bakeoff.md)
// measured 141 incorrect pairs vs 14 correct on a seeded corpus, and caught
// its auto-merge writing a nonexistent column (orphaned status flips). Dedup
// is owned by core/algorithms (two-stage detector + proposals + history) and
// surfaced via squish_dedup; this module only routes the 'dedup' step there.

/**
 * Options for unified full maintenance run (Phase 6)
 */
export interface FullMaintenanceOptions {
  projectId?: string;
  dryRun?: boolean;
  steps?: ('dedup' | 'stale' | 'consolidate' | 'inbox')[];
  age?: number; // days threshold
  llmEnabled?: boolean; // use LLM for enhanced steps
}

/**
 * Result of a unified full maintenance run
 */
export interface FullMaintenanceResult {
  ok: boolean;
  steps: Record<string, { ok: boolean; count: number; error?: string }>;
  dryRun: boolean;
}

import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Run all maintenance steps in sequence: dedup -> stale -> consolidate -> inbox.
 * Standard mode (no LLM) by default. LLM auto-detected from config.llmEnabled.
 *
 * Step routing:
 * - dedup        -> core/algorithms detect-duplicates (proposals only; merges
 *                   happen through squish_dedup approve/reject + history)
 * - stale        -> stale-cleaner (auto-clean or dry-run count)
 * - consolidate  -> GAC geometry-aware consolidation (core/memory/consolidation)
 * - inbox        -> places inbox triage
 *
 * This is the unified entry point for `squish clean`.
 */
export async function runFullMaintenance(
  options?: FullMaintenanceOptions
): Promise<FullMaintenanceResult> {
  const {
    projectId,
    dryRun = false,
    steps = ['dedup', 'stale', 'consolidate', 'inbox'],
    age,
    llmEnabled,
  } = options ?? {};

  const stepResults: Record<string, { ok: boolean; count: number; error?: string }> = {};
  const useLlm = llmEnabled !== undefined ? llmEnabled : config.llmEnabled;

  // Cache original llm config if temporarily overriding
  const origLlmEnabled = config.llmEnabled;

  try {
    // Temporarily override llmEnabled for this run if specified
    if (llmEnabled !== undefined && llmEnabled !== config.llmEnabled) {
      (config as any).llmEnabled = llmEnabled;
    }

    // --- Step 1: Dedup (canonical proposal workflow) ---
    if (steps.includes('dedup')) {
      try {
        const { handleDetectDuplicates } = await import('./algorithms/handlers/detect-duplicates.js');

        if (projectId) {
          const result = await handleDetectDuplicates({ projectId });
          stepResults.dedup = {
            ok: result.ok,
            count: result.ok && result.data ? result.data.proposalsCreated : 0,
            error: result.ok ? undefined : String((result as any).error ?? 'detection failed'),
          };
          logger.info(`[FullMaintenance] dedup: ${stepResults.dedup.count} merge proposals created`);
        } else {
          // Scan every project when none specified
          const { getAllProjects } = await import('./projects.js');
          const projects = await getAllProjects();
          let totalProposals = 0;
          for (const project of projects) {
            try {
              const result = await handleDetectDuplicates({ projectId: project.id });
              if (result.ok && result.data) totalProposals += result.data.proposalsCreated;
            } catch (err) {
              logger.error(
                `[FullMaintenance] dedup scan failed for ${project.id}:`,
                err instanceof Error ? err.message : String(err)
              );
            }
          }
          stepResults.dedup = { ok: true, count: totalProposals, error: undefined };
          logger.info(`[FullMaintenance] dedup: ${totalProposals} merge proposals created across ${projects.length} projects`);
        }
      } catch (error: any) {
        stepResults.dedup = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] dedup step failed:', error);
      }
    }

    // --- Step 2: Stale cleanup ---
    if (steps.includes('stale')) {
      try {
        const { getStaleMemories, runAutoClean } = await import('./memory/stale-cleaner.js');

        if (dryRun) {
          // Dry-run: just count what would be cleaned
          const stale = await getStaleMemories({
            olderThanDays: age ?? 30,
            confidenceLevels: ['outdated', 'speculative'],
            minImportance: 40,
            projectId,
          });
          const unpinnedCount = stale.filter((m: any) => !m.isPinned).length;
          stepResults.stale = {
            ok: true,
            count: unpinnedCount,
            error: undefined,
          };
          logger.info(`[FullMaintenance] stale (dry-run): ${unpinnedCount} memories would be cleaned`);
        } else {
          const result = await runAutoClean({
            olderThanDays: age,
            confidenceLevels: ['outdated', 'speculative'],
            minImportance: 40,
            projectId,
          });
          stepResults.stale = {
            ok: true,
            count: result.deleted,
            error: undefined,
          };
          logger.info(`[FullMaintenance] stale: ${result.deleted} memories cleaned`);
        }
      } catch (error: any) {
        stepResults.stale = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] stale step failed:', error);
      }
    }

    // --- Step 3: Consolidation ---
    if (steps.includes('consolidate')) {
      try {
        if (projectId) {
          const { consolidateMemories } = await import('./memory/consolidation.js');
          const consolidationResults = await consolidateMemories({
            projectId,
            minAge: age,
            maxImportance: 30,
            minClusterSize: 3,
            similarityThreshold: 0.7,
            limit: 100,
          });
          const totalSources = consolidationResults.reduce(
            (sum, r) => sum + (r.clusterSize || 0),
            0
          );
          stepResults.consolidate = {
            ok: true,
            count: totalSources,
            error: undefined,
          };
          logger.info(`[FullMaintenance] consolidate: ${consolidationResults.length} clusters, ${totalSources} sources`);
        } else {
          // No project specified - skip consolidation
          stepResults.consolidate = {
            ok: true,
            count: 0,
            error: undefined,
          };
          logger.info('[FullMaintenance] consolidate: skipped (no project specified)');
        }
      } catch (error: any) {
        stepResults.consolidate = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] consolidate step failed:', error);
      }
    }

    // --- Step 4: Inbox triage ---
    if (steps.includes('inbox')) {
      try {
        const { processInboxForAllProjects } = await import('./places/memory-places.js');
        const inboxResult = await processInboxForAllProjects();
        stepResults.inbox = {
          ok: true,
          count: inboxResult.totalMoved,
          error: undefined,
        };
        logger.info(`[FullMaintenance] inbox: ${inboxResult.totalMoved} moved, ${inboxResult.totalErrors} errors`);
      } catch (error: any) {
        stepResults.inbox = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] inbox step failed:', error);
      }
    }

    void useLlm;

    logger.info('[FullMaintenance] completed', { dryRun, steps: Object.keys(stepResults) });

    return {
      ok: true,
      steps: stepResults,
      dryRun,
    };
  } catch (error: any) {
    logger.error('[FullMaintenance] unexpected error:', error);
    return {
      ok: false,
      steps: stepResults,
      dryRun,
    };
  } finally {
    // Restore original llm config
    if (llmEnabled !== undefined && llmEnabled !== origLlmEnabled) {
      (config as any).llmEnabled = origLlmEnabled;
    }
  }
}
