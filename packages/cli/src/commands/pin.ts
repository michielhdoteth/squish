/**
 * Pin/Unpin Commands - Mark memories as pinned to prevent consolidation
 *
 * Usage: squish pin <memoryId> [--reason "text"]
 *        squish unpin <memoryId>
 *        squish promote <memoryId>
 */

import { Command } from 'commander';
import { pinMemory, unpinMemory, getPinnedMemories } from '../../../../core/security/governance.js';
import { promoteToSturdy, getTierStats } from '../../../../core/memory/tiers.js';

export function registerPinCommand(program: Command) {
  // squish pin <memoryId>
  program
    .command('pin <memoryId>')
    .description('Pin a memory to prevent decay and consolidation')
    .option('--reason <reason>', 'Reason for pinning (stored in metadata)')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (memoryId: string, options: any) => {
      try {
        await pinMemory(memoryId);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, pinned: true, memoryId }));
        } else {
          console.log(`Pinned memory: ${memoryId}`);
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });

  // squish unpin <memoryId>
  program
    .command('unpin <memoryId>')
    .description('Unpin a memory to allow normal decay and consolidation')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (memoryId: string, options: any) => {
      try {
        await unpinMemory(memoryId);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, pinned: false, memoryId }));
        } else {
          console.log(`Unpinned memory: ${memoryId}`);
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });

  // squish list-pinned
  program
    .command('list-pinned')
    .description('List all pinned memories')
    .option('-p, --project <project>', 'Project path (global if omitted)')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      try {
        const pinned = await getPinnedMemories(options.project);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, count: pinned.length, memories: pinned }, null, 2));
        } else {
          if (pinned.length === 0) {
            console.log('No pinned memories found.');
            return;
          }
          console.log(`Pinned memories (${pinned.length}):`);
          for (const m of pinned) {
            const content = (m.content || '(no content)').substring(0, 120);
            console.log(`  ${m.id} - ${content}`);
          }
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });

  // squish promote <memoryId>
  program
    .command('promote <memoryId>')
    .description('Promote a memory to sturdy tier (pins it and prevents decay)')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (memoryId: string, options: any) => {
      try {
        const success = await promoteToSturdy(memoryId);
        if (options.json) {
          console.log(JSON.stringify({ ok: success, promoted: true, memoryId }));
        } else {
          if (success) {
            console.log(`Promoted memory to sturdy tier: ${memoryId}`);
          } else {
            console.error('Failed to promote memory');
            process.exit(1);
          }
        }
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
