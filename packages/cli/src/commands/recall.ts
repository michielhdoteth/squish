/**
 * Recall Command - Get memory by ID or search
 * 
 * Usage: squish recall "query-or-uuid" [--pretty]
 */

import { Command } from 'commander';
import { getMemory, search } from '../../../../core/memory/memories.js';
import { shouldReturnRawFallback } from '../../../../core/ingestion/signal-engine.js';
import { getMemorySnapshot } from '../../../../core/snapshots/retrieval.js';
import { getRemediationForError } from '../errors.js';
import { colors } from '../colors.js';

export function registerRecallCommand(program: Command) {
  program
    .command('recall <query>')
    .description('Search or get memory by ID')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('--place <place>', 'Filter by place (inbox, ref, wip, sandbox, board, sparks, archive)')
    .option('-l, --limit <number>', 'Max results', '5')
    .option('-P, --pretty', 'Human-friendly output', false)
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (query: string, options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
        
        let result;
        
        if (isUuid) {
          const memory = await getMemory(query, true);
          if (!memory) {
            const payload = { ok: false, error: 'Memory not found', command: 'recall', remediation: 'Check the ID or query, or run "squish recall" to find memories' };
            console.error(options.json ? JSON.stringify(payload) : `${colors.red('Error')}: Memory not found\nHint: Check the ID or query, or run "squish recall" to find memories`);
            process.exit(1);
          }
          result = [memory];
        } else {
          const limit = parseInt(options.limit) || 5;
          const memories = await search({
            query,
            project: options.project,
            limit,
            type: options.type,
            placeType: options.place,
          });
          result = await Promise.all(memories.map(async (memory) => {
            const metadata = (memory.metadata ?? {}) as Record<string, unknown>;
            const rawFallbackSnapshotId = typeof metadata.rawFallbackSnapshotId === 'string'
              ? metadata.rawFallbackSnapshotId
              : typeof (metadata.signal as Record<string, unknown> | undefined)?.rawFallbackSnapshotId === 'string'
                ? String((metadata.signal as Record<string, unknown>).rawFallbackSnapshotId)
                : undefined;
            const nuanceSuppressed = Boolean(
              metadata.nuanceSuppressed ??
              (metadata.signal as Record<string, unknown> | undefined)?.nuanceSuppressed
            );

            if (shouldReturnRawFallback({
              query,
              hasRawFallback: Boolean(rawFallbackSnapshotId),
              nuanceSuppressed,
            }) && rawFallbackSnapshotId) {
              const snapshot = await getMemorySnapshot(rawFallbackSnapshotId);
              return {
                ...memory,
                rawFallback: snapshot?.content ?? null,
              };
            }

            return memory;
          }));
        }

        if (options.json) {
          console.log(JSON.stringify({
            ok: true,
            count: result.length,
            results: result.map(r => ({
              id: r.id,
              type: r.type,
              content: r.content,
              tags: r.tags,
              similarity: r.similarity,
              createdAt: r.createdAt
            }))
          }, null, 2));
          return;
        }

        if (options.pretty) {
          console.log(colors.bold(`\nFound ${result.length} memories:\n`));
          result.forEach((r, i) => {
            console.log(`${colors.cyan(`${i + 1}.`)} [${colors.green(r.type)}] ${r.content?.substring(0, 100)}...`);
            console.log(`   Tags: ${colors.dim(r.tags?.join(', ') || 'none')}`);
            console.log(`   Similarity: ${colors.dim(r.similarity?.toFixed(3) || 'N/A')}`);
            console.log(`   ID: ${colors.dim(r.id)}`);
            console.log(`   Created: ${colors.dim(r.createdAt || 'unknown')}\n`);
          });
        } else {
          // Default human-readable output
          console.log(`Found ${result.length} memories:\n`);
          result.forEach((r, i) => {
            console.log(`${i + 1}. [${r.type}] ${r.content?.substring(0, 100)}...`);
            console.log(`   ID: ${r.id}`);
            console.log(`   Created: ${r.createdAt || 'unknown'}\n`);
          });
        }
      } catch (error: any) {
        const remediation = getRemediationForError(error);
        const payload = {
          ok: false,
          error: error.message,
          command: 'recall',
          remediation,
        };
        console.error(options.json ? JSON.stringify(payload) : `${colors.red('Error')}: ${error.message}\nHint: ${remediation}`);
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
