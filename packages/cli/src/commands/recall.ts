/**
 * Recall Command - Get memory by ID or search
 * 
 * Usage: squish recall "query-or-uuid" [--pretty]
 */

import { Command } from 'commander';
import { getMemory, search } from '../../../../core/memory/memories.js';

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
          result = memories;
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
