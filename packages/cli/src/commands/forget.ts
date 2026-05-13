/**
 * Forget Command - Delete memory
 * 
 * Usage: squish forget <memoryId> [--confirm] [--older-than "30 days"]
 */

import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { getDbClient } from '../../../../core/lib/db-client.js';
import { search } from '../../../../core/memory/memories.js';
import { filterByDateRange } from '../../../../core/lib/utils.js';

export function registerForgetCommand(program: Command) {
  program
    .command('forget <memoryId>')
    .description('Delete memory (single or bulk with --older-than --search)')
    .option('--older-than <period>', 'Bulk delete memories older than')
    .option('--search <query>', 'Search query to match specific memories')
    .option('--type <type>', 'Filter by memory type')
    .option('--confirm', 'Actually delete (default is dry-run)', false)
    .option('-l, --limit <number>', 'Max memories to delete', '100')
    .option('-p, --project <project>', 'Project path (global if omitted)')
    .action(async (memoryId: string, options: any) => {
      try {
        const { db, schema } = await getDbClient();
        
        if (memoryId && memoryId !== 'all') {
          await db.delete(schema.memories).where(eq(schema.memories.id, memoryId));
          console.log(JSON.stringify({ ok: true, deleted: 1, memoryId }));
          return;
        }
        
        if (!options.olderThan && !options.search) {
          console.error(JSON.stringify({ 
            ok: false, 
            error: 'Provide memoryId or use --older-than / --search for bulk delete' 
          }));
          process.exit(1);
        }
        
        const results = await search({
          query: options.search || '',
          project: options.project,
          limit: parseInt(options.limit) || 100,
          type: options.type
        });
        
        let filtered = results;
        if (options.olderThan) {
          filtered = filterByDateRange(results, '', options.olderThan);
        }
        
        const deleted = [];
        if (options.confirm) {
          for (const mem of filtered) {
            await db.delete(schema.memories).where(eq(schema.memories.id, mem.id));
            deleted.push(mem.id);
          }
        }
        
        console.log(JSON.stringify({
          ok: true,
          matched: filtered.length,
          deleted: deleted.length,
          dryRun: !options.confirm
        }, null, 2));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
