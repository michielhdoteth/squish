/**
 * Clean Command - Auto-run deduplication and consolidation
 * 
 * Usage: squish clean [--confirm]
 * 
 * Auto-features:
 * - Finds near-duplicate memories and consolidates them
 * - Marks old/low-importance memories as stale
 * - Reclaims space by removing redundant data
 */

import { Command } from 'commander';
import { consolidateMemories } from '../../../../core/memory/consolidation.js';
import { getMemoryStats } from '../../../../core/memory/stats.js';
import { requireProject } from '../../../../core/projects.js';

export function registerCleanCommand(program: Command) {
  program
    .command('clean')
    .description('Auto-run deduplication and consolidation')
    .option('--confirm', 'Actually run (default is dry-run)', false)
    .option('--project <project>', 'Project path (global if omitted)')
    .option('--dry-run', 'Show what would be consolidated without doing it', false)
    .action(async (options: any) => {
      try {
        // Get project ID
        const project = await requireProject(options.project);
        
        // Get current stats before cleaning
        const stats = await getMemoryStats(options.project);
        
        if (!options.confirm && !options.dryRun) {
          console.log(JSON.stringify({
            ok: true,
            message: 'Dry-run mode: use --confirm to actually clean, or --dry-run to see what would happen',
            currentStats: {
              totalMemories: stats.totalMemories,
              byType: stats.byType
            }
          }, null, 2));
          return;
        }

        // Run consolidation
        const result = await consolidateMemories({
          projectId: project.id,
          minAge: 7,        // Only memories older than 7 days
          maxImportance: 40, // Only low-importance memories
          minClusterSize: 2,  // Need at least 2 similar memories
          limit: 50
        });

        console.log(JSON.stringify({
          ok: true,
          action: options.dryRun ? 'dry-run' : 'completed',
          consolidated: result.length,
          results: result.map(r => ({
            id: r.consolidatedMemoryId,
            sources: r.sourceMemoryIds.length,
            summary: r.summary
          }))
        }, null, 2));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      }
    });
}
