/**
 * Stats Command - View memory statistics
 * 
 * Usage: squish stats [--project /path]
 */

import { Command } from 'commander';
import { getMemoryStats } from '../../../../core/memory/stats.js';

export function registerStatsCommand(program: Command) {
  program
    .command('stats')
    .description('View memory statistics')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (options: any) => {
      try {
        const stats = await getMemoryStats(options.project);
        console.log(JSON.stringify(stats, null, 2));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
