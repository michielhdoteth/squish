/**
 * Stale Command - Show stale memories
 * 
 * Usage: squish stale [--days 30] [--limit 20]
 */

import { Command } from 'commander';
import { getRecent } from '../../../../core/memory/memories.js';

export function registerStaleCommand(program: Command) {
  program
    .command('stale')
    .description('Show stale memories (old, low-confidence, or rarely accessed)')
    .option('-d, --days <number>', 'Show memories older than N days', '30')
    .option('-l, --limit <number>', 'Max results', '20')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (options: any) => {
      try {
        const days = parseInt(options.days) || 30;
        const cutoffDate = new Date(Date.now() - days * 86400000);
        const results = await getRecent(options.project, 500);
        
        const stale = results.filter((m: any) => {
          const created = m.createdAt ? new Date(m.createdAt) : null;
          const isOld = created && created < cutoffDate;
          const isLowConfidence = m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative';
          const hasLowImportance = (m.importance || 50) < 40;
          return isOld || isLowConfidence || hasLowImportance;
        });
        
        const limited = stale.slice(0, parseInt(options.limit) || 20);
        console.log(JSON.stringify({
          ok: true,
          totalStale: stale.length,
          count: limited.length,
          memories: limited
        }, null, 2));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
