/**
 * Graph Command - Knowledge graph management
 *
 * Usage:
 *   squish graph rebuild [--project /path] [--clear] [--no-llm] [--batch-size 10]
 *   squish graph stats   [--project /path] [--json]
 */

import { Command } from 'commander';
import { buildProjectGraph } from '../../../../core/graph/pipeline.js';
import { getGraphPipelineStats } from '../../../../core/graph/pipeline.js';
import { getRemediationForError } from '../errors.js';

export function registerGraphCommand(program: Command) {
  const graph = program
    .command('graph')
    .description('Knowledge graph management');

  // ── squish graph rebuild ─────────────────────────────────────────────
  graph
    .command('rebuild')
    .description('Rebuild the knowledge graph from all project memories')
    .option('-p, --project <project>', 'Project path')
    .option('--clear', 'Clear existing graph before rebuilding', false)
    .option('--no-llm', 'Disable LLM extraction (regex only)')
    .option('--no-dedup', 'Skip entity deduplication')
    .option('--batch-size <n>', 'Batch size for processing', '10')
    .option('--max-memories <n>', 'Max memories to process', '100000')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      const startTime = Date.now();

      if (!options.json) {
        console.log('Rebuilding knowledge graph...');
        if (options.clear) console.log('  Clearing existing graph first');
      }

      try {
        const stats = await buildProjectGraph(options.project, {
          clearExisting: options.clear,
          batchSize: parseInt(options.batchSize, 10),
          preferLLM: options.llm !== false,
          deduplicate: options.dedup !== false,
          maxMemories: parseInt(options.maxMemories, 10),
          onProgress: options.json ? undefined : (p) => {
            const pct = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
            process.stdout.write(`\r  [${pct}%] ${p.processed}/${p.total} memories | ${p.entitiesCreated} entities | ${p.relationsCreated} relations`);
          },
        });

        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
        } else {
          console.log('\n');
          console.log('Graph rebuild complete:');
          console.log(`  Memories processed: ${stats.memoriesProcessed}`);
          console.log(`  Entities created:   ${stats.entitiesCreated}`);
          console.log(`  Relations created:  ${stats.relationsCreated}`);
          console.log(`  Entities merged:    ${stats.entitiesDeduplicated}`);
          console.log(`  Errors:             ${stats.errors}`);
          console.log(`  Duration:           ${(stats.durationMs / 1000).toFixed(1)}s`);
          console.log(`  Extraction:         ${stats.extractionSource}`);
        }
      } catch (error: any) {
        const remediation = getRemediationForError(error);
        if (options.json) {
          console.error(JSON.stringify({ ok: false, error: error.message, remediation }));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Hint: ${remediation}`);
        }
        process.exit(1);
      } finally {
        if (options.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });

  // ── squish graph stats ───────────────────────────────────────────────
  graph
    .command('stats')
    .description('Show knowledge graph statistics')
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        const stats = await getGraphPipelineStats(options.project);

        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
          return;
        }

        console.log('Knowledge Graph Stats:');
        console.log(`  Entities:    ${stats.entityCount}`);
        console.log(`  Relations:   ${stats.relationCount}`);
        console.log(`  Avg connections: ${stats.avgConnections}`);

        if (Object.keys(stats.relationTypes).length > 0) {
          console.log('  Relation types:');
          for (const [type, count] of Object.entries(stats.relationTypes).sort((a, b) => b[1] - a[1])) {
            console.log(`    ${type}: ${count}`);
          }
        }

        if (stats.lastPipelineAt) {
          console.log(`  Last pipeline: ${stats.lastPipelineAt.toISOString()}`);
        }
      } catch (error: any) {
        const remediation = getRemediationForError(error);
        if (options.json) {
          console.error(JSON.stringify({ ok: false, error: error.message, remediation }));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Hint: ${remediation}`);
        }
        process.exit(1);
      } finally {
        if (options.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });
}
