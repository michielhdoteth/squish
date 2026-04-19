import { Command } from 'commander';
import { buildInspectState } from '../../../../core/runtime/trust-state.js';
import { formatInspectReport } from '../../../../core/runtime/trust-report.js';

export function registerInspectCommand(program: Command) {
  program
    .command('inspect <id>')
    .description('Inspect how and why a memory was stored')
    .option('-P, --pretty', 'Human-friendly output', false)
    .option('--json', 'Emit machine-readable output', false)
    .action(async (id: string, options: any) => {
      try {
        const inspection = await buildInspectState(id);
        if (!inspection) {
          console.error(JSON.stringify({ ok: false, error: 'Memory not found' }));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ ok: true, inspection }, null, 2));
        } else {
          console.log(formatInspectReport(inspection));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
