import { Command } from 'commander';
import { buildHealthState } from '../../../../core/runtime/trust-state.js';
import { formatHealthReport } from '../../../../core/runtime/trust-report.js';

export function registerHealthCommand(program: Command) {
  program
    .command('health')
    .description('Show runtime health for the current project')
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      try {
        const health = await buildHealthState(options.project);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...health }, null, 2));
          return;
        }
        console.log(formatHealthReport(health));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
