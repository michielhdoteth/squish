/**
 * Migrate Command - DEPRECATED
 * 
 * This command is deprecated. Use `squish doctor --migrate-memories` instead.
 * 
 * Legacy usage: squish migrate <source-path> [--target <path>] [--delete-source] [--dry-run]
 */

import { Command } from 'commander';
import { migrateMemories, type MigrateResult } from '../../../../core/memory/migrate.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function getGlobalSquishDir(): string {
  return join(homedir(), '.squish');
}

export function registerMigrateCommand(program: Command) {
  program
    .command('migrate <source>')
    .description('[DEPRECATED] Use `squish doctor --migrate-memories` instead')
    .option('-t, --target <path>', 'Target .squish directory (default: current directory)')
    .option('-g, --global', 'Migrate to global ~/.squish/ directory', false)
    .option('-d, --delete-source', 'Delete source directory after successful migration (requires --yes)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('-n, --dry-run', 'Preview migration without making changes', false)
    .action(async (source: string, options: any) => {
      console.warn('WARNING: `squish migrate` is deprecated. Use `squish doctor --migrate-memories <source>` instead.');
      console.warn('This command will be removed in a future version.\n');
      const target = options.global ? getGlobalSquishDir() : (options.target || process.cwd());
      const dryRun = options.dryRun || false;
      const deleteSource = options.deleteSource || false;
      const confirmed = options.yes || false;

      // Validate paths
      if (!existsSync(source)) {
        console.error(`Error: Source directory does not exist: ${source}`);
        process.exit(1);
      }

      const sourceDbPath = join(source, 'squish.db');
      const targetDbPath = join(target, 'squish.db');

      if (!existsSync(sourceDbPath)) {
        console.error(`Error: Source is not a .squish directory (no squish.db found): ${source}`);
        process.exit(1);
      }

      if (!existsSync(targetDbPath)) {
        if (options.global) {
          // Auto-create global directory
          const { mkdirSync } = await import('fs');
          mkdirSync(target, { recursive: true });
          const { bootstrapDatabase } = await import('../../../../db/bootstrap.js');
          await bootstrapDatabase(target);
          console.log(`Created global ~/.squish/ directory`);
        } else {
          console.error(`Error: Target is not a .squish directory (no squish.db found): ${target}`);
          process.exit(1);
        }
      }

      // Show plan
      console.log('\n=== Migration Plan ===');
      console.log(`Source:      ${source}`);
      console.log(`Target:      ${target}`);
      console.log(`Dry-run:     ${dryRun ? 'YES (no changes)' : 'NO'}`);
      console.log(`Delete source: ${deleteSource ? 'YES (after success)' : 'NO'}`);

      if (!confirmed && !dryRun) {
        console.log('\nThis will copy ALL memories from source to target.');
        console.log('The source directory will NOT be deleted unless you also pass --delete-source');
        console.log('Use --yes to confirm or --dry-run to preview.\n');
        process.exit(1);
      }

      try {
        console.log('\nMigrating...\n');
        
        const result: MigrateResult = await migrateMemories(source, target, {
          dryRun,
          deleteSource,
        });

        console.log('=== Migration Result ===');
        console.log(`Memories copied:    ${result.memoriesCopied}`);
        console.log(`Learnings copied:   ${result.observationsCopied}`);
        console.log(`Associations copied: ${result.associationsCopied}`);
        console.log(`Projects mapped:    ${result.projectsMapped}`);
        
        if (deleteSource && !dryRun && result.sourceDeleted) {
          console.log(`Source deleted:     YES`);
        } else if (deleteSource && !dryRun && !result.sourceDeleted) {
          console.log(`Source deleted:     NO (manual deletion required)`);
        } else if (deleteSource && dryRun) {
          console.log(`Source would be deleted after confirmation`);
        }

        console.log(`\n${result.message}`);

        if (result.memoriesCopied > 0 && !dryRun) {
          console.log('\nTip: After verifying the migration worked, you can manually delete the source directory:');
          console.log(`  rm -rf ${source}`);
        }

      } catch (error) {
        console.error(`Migration failed:`, error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}