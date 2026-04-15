/**
 * Link Command - Manage memory associations
 * 
 * Usage: squish link find <memoryId> [--depth 2]
 *        squish link add <fromId> <toId> [--type relates_to]
 */

import { Command } from 'commander';
import { createAssociation, getRelatedMemories } from '../../../../core/associations.js';

export function registerLinkCommand(program: Command) {
  program
    .command('link <action> [args...]')
    .description('Manage links (find/add/list)')
    .option('-d, --depth <number>', 'Graph traversal depth', '2')
    .option('-t, --type <type>', 'Association type', 'relates_to')
    .option('-w, --weight <number>', 'Association weight', '0.5')
    .action(async (action: string, args: string[], options: any) => {
      try {
        if (action === 'find' && args[0]) {
          const related = await getRelatedMemories(args[0], options.depth * 5);
          console.log(JSON.stringify({ ok: true, count: related.length, related }, null, 2));
        } else if (action === 'add' && args[0] && args[1]) {
          await createAssociation(args[0], args[1], options.type as any, options.weight);
          
          // Auto-update knowledge graph (fire-and-forget)
          try {
            const { addMemoryToGraph } = await import('../../../../core/graph/graph-builder.js');
            const [result1, result2] = await Promise.all([
              addMemoryToGraph(args[0]).catch(() => null),
              addMemoryToGraph(args[1]).catch(() => null)
            ]);
            if (result1 || result2) {
              console.error(`[Graph] Updated graph for linked memories`);
            }
          } catch (e) {
            // Ignore graph errors
          }
          
          console.log(JSON.stringify({ ok: true, action: 'created', from: args[0], to: args[1], type: options.type }));
        } else {
          console.log(JSON.stringify({ ok: false, error: 'Usage: squish link find <id> OR squish link add <from> <to>' }));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
