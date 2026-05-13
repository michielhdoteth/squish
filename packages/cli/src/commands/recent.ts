/**
 * Recent Command - Get recent memories by period
 * 
 * Usage: squish recent [--period today] [--limit 10]
 */

import { Command } from 'commander';
import { getRecent } from '../../../../core/memory/memories.js';
import { filterByDateRange } from '../../../../core/lib/utils.js';

export function registerRecentCommand(program: Command) {
  program
    .command('recent')
    .description('Recent memories (today/yesterday/thisweek/7days/30days)')
    .option('--period <period>', 'Period: today, yesterday, thisweek, 7days, 14days, 30days, 90days', 'today')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-p, --project <project>', 'Project path (global if omitted)')
    .option('-P, --pretty', 'Human-friendly output', false)
    .action(async (options: any) => {
      try {
        const limit = parseInt(options.limit) || 10;
        const allRecent = await getRecent(options.project, 500);
        
        const periodMap: Record<string, [string, string]> = {
          today: ['today', 'now'],
          yesterday: ['yesterday', 'today'],
          thisweek: ['this week', 'now'],
          '7days': ['7 days', 'now'],
          '14days': ['14 days', 'now'],
          '30days': ['30 days', 'now'],
          '90days': ['90 days', 'now'],
        };
        
        const [since, until] = periodMap[options.period] || [options.period, 'now'];
        const filtered = filterByDateRange(allRecent, since, until);
        const results = filtered.slice(0, limit);

        if (options.pretty) {
          console.log(`\nRecent memories (${options.period}):\n`);
          results.forEach((r, i) => {
            console.log(`${i + 1}. [${r.type}] ${r.content?.substring(0, 100)}...`);
            console.log(`   ${r.createdAt || 'unknown'}\n`);
          });
        } else {
          console.log(JSON.stringify({
            ok: true,
            period: options.period,
            count: results.length,
            results
          }, null, 2));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
