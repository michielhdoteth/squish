/**
 * Search Command - Search memories
 * 
 * Usage: squish search "query" [--type fact] [--place sandbox] [--limit 10] [--pretty]
 */

import { Command } from 'commander';
import { search } from '../../../../core/memory/memories.js';

export function registerSearchCommand(program: Command) {
  program
    .command('search <query>')
    .description('Search memories')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('--place <place>', 'Filter by place (inbox, ref, wip, sandbox, board, sparks, archive)')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .option('-P, --pretty', 'Human-friendly output', false)
    .action(async (query: string, options: any) => {
      try {
        const limit = parseInt(options.limit) || 10;
        
        const results = await search({
          query,
          project: options.project,
          limit,
          type: options.type
        });

        if (options.pretty) {
          console.log(`\nFound ${results.length} memories:\n`);
          results.forEach((r, i) => {
            console.log(`${i + 1}. [${r.type}] ${r.content?.substring(0, 100)}...`);
            console.log(`   Tags: ${r.tags?.join(', ') || 'none'}`);
            console.log(`   Importance: ${r.importance || 'N/A'}\n`);
          });
        } else {
          console.log(JSON.stringify({
            ok: true,
            count: results.length,
            place: options.place,
            results: results.map(r => ({
              id: r.id,
              type: r.type,
              content: r.content,
              tags: r.tags,
              importance: r.importance,
              similarity: r.similarity
            }))
          }, null, 2));
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
