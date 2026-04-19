/**
 * Recall Command - Get memory by ID or search
 * 
 * Usage: squish recall "query-or-uuid" [--pretty]
 */

import { Command } from 'commander';
import { getMemory, search } from '../../../../core/memory/memories.js';
import { shouldReturnRawFallback } from '../../../../core/ingestion/signal-engine.js';
import { getMemorySnapshot } from '../../../../core/snapshots/retrieval.js';

export function registerRecallCommand(program: Command) {
  program
    .command('recall <query>')
    .description('Search or get memory by ID')
    .option('-P, --pretty', 'Human-friendly output', false)
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (query: string, options: any) => {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
        
        let result;
        
        if (isUuid) {
          const memory = await getMemory(query);
          if (!memory) {
            console.error(JSON.stringify({ ok: false, error: 'Memory not found' }));
            process.exit(1);
          }
          result = [memory];
        } else {
          const memories = await search({
            query,
            project: options.project,
            limit: 5
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

        if (options.pretty) {
          console.log(`\nFound ${result.length} memories:\n`);
          result.forEach((r, i) => {
            console.log(`${i + 1}. [${r.type}] ${r.content?.substring(0, 150)}...`);
            console.log(`   ID: ${r.id}`);
            console.log(`   Created: ${r.createdAt || 'unknown'}\n`);
          });
        } else {
          console.log(JSON.stringify({
            ok: true,
            count: result.length,
            results: result
          }, null, 2));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
