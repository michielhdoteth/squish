import { Command } from 'commander';
import { runFullMaintenance } from '../../../../core/consolidation.js';

export function registerCleanCommand(program: Command): void {
  const cleanCommand = new Command('clean')
    .description('Run full memory maintenance: dedup + stale cleanup + consolidation + inbox triage')
    .option('--dry-run', 'Preview without making changes (default for safety)')
    .option('--steps <list>', 'Comma-separated: dedup,stale,consolidate,inbox (default: all)')
    .option('--age <days>', 'Age threshold for stale/consolidation in days (default: 30)')
    .option('--confirm', 'Actually run the maintenance (default: dry-run)')
    .action(async (opts) => {
      const steps = opts.steps ? opts.steps.split(',').map((s: string) => s.trim()) : undefined;
      const result = await runFullMaintenance({
        dryRun: !opts.confirm,
        steps: steps as any,
        age: opts.age ? parseInt(opts.age) : undefined,
      });

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
    });

  program.addCommand(cleanCommand);
}
