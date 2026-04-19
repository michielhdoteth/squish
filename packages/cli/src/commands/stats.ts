/**
 * Stats Command - View memory statistics
 * 
 * Usage: squish stats [--project /path]
 */

import { Command } from 'commander';
import { buildStatsState } from '../../../../core/runtime/trust-state.js';
import { formatStatsReport } from '../../../../core/runtime/trust-report.js';

export function registerStatsCommand(program: Command) {
  program
    .command('stats')
    .description('View memory statistics')
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      try {
        const stats = await buildStatsState(options.project);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
          return;
        }
        console.log(formatStatsReport(stats));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
