/**
 * Stale Command - Show stale memories
 * 
 * Usage: squish stale [--days 30] [--limit 20]
 */

import { Command } from 'commander';
import { getRecent } from '../../../../core/memory/memories.js';
import { getRemediationForError } from '../errors.js';
import { colors } from '../colors.js';

export function registerStaleCommand(program: Command) {
  program
    .command('stale')
    .description('Show stale memories (old, low-confidence, or rarely accessed)')
    .option('-d, --days <number>', 'Show memories older than N days', '30')
    .option('-l, --limit <number>', 'Max results', '20')
    .option('-p, --project <project>', 'Project path (global if omitted)')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
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

        if (options.json) {
          console.log(JSON.stringify({
            ok: true,
            totalStale: stale.length,
            count: limited.length,
            memories: limited
          }, null, 2));
          return;
        }

        console.log(`${colors.bold(`Stale memories (${stale.length} total):`)}\n`);
        limited.forEach((r: any, i: number) => {
          console.log(`${colors.green(`${i + 1}.`)} [${colors.yellow(r.type)}] ${r.content?.substring(0, 100)}...`);
          console.log(`   ID: ${colors.dim(r.id)} Created: ${colors.dim(r.createdAt || 'unknown')}\n`);
        });
      } catch (error: any) {
        const remediation = getRemediationForError(error);
        const payload = {
          ok: false,
          error: error.message,
          command: 'stale',
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
