import { Command } from 'commander';
import { runFullMaintenance } from '../../../../core/consolidation.js';
import { getRemediationForError } from '../errors.js';

export function registerCleanCommand(program: Command): void {
  const cleanCommand = new Command('clean')
    .description('Run full memory maintenance: dedup + stale cleanup + consolidation + inbox triage')
    .option('--dry-run', 'Preview without making changes (default for safety)')
    .option('--steps <list>', 'Comma-separated: dedup,stale,consolidate,inbox (default: all)')
    .option('--age <days>', 'Age threshold for stale/consolidation in days (default: 30)')
    .option('--confirm', 'Actually run the maintenance (default: dry-run)')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (opts) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (opts.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        const steps = opts.steps ? opts.steps.split(',').map((s: string) => s.trim()) : undefined;
        const result = await runFullMaintenance({
          dryRun: !opts.confirm,
          steps: steps as any,
          age: opts.age ? parseInt(opts.age) : undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
          return;
        }

        if (result.dryRun) {
          console.log('--- DRY RUN (no changes made) ---\n');
        }
        for (const [step, info] of Object.entries(result.steps)) {
          const icon = info.ok ? 'OK' : 'FAIL';
          console.log(`  ${step}: [${icon}] count=${info.count}${info.error ? ' error=' + info.error : ''}`);
        }
        if (result.dryRun) {
          console.log('\nRun with --confirm to actually apply changes.');
        }
      } catch (error: any) {
        const remediation = getRemediationForError(error);
        if (opts.json) {
          console.error(JSON.stringify({ ok: false, error: error.message, remediation }));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Hint: ${remediation}`);
        }
        process.exit(1);
      } finally {
        if (opts.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });

  program.addCommand(cleanCommand);
}
