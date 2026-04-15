/**
 * Squish CLI - Main Entry Point
 * Universal Memory for AI Agents
 * 
 * Usage:
 *   squish remember "Store this memory"
 *   squish search "query"
 *   squish context --list-projects
 */

import { Command } from 'commander';

// Import all commands
import { registerRememberCommand } from './commands/remember.js';
import { registerSearchCommand } from './commands/search.js';
import { registerRecallCommand } from './commands/recall.js';
import { registerRecentCommand } from './commands/recent.js';
import { registerContextCommand } from './commands/context.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerForgetCommand } from './commands/forget.js';
import { registerLinkCommand } from './commands/link.js';
import { registerStaleCommand } from './commands/stale.js';
import { registerCleanCommand } from './commands/clean.js';
import { registerMigrateCommand } from './commands/migrate.js';
import { registerRunCommand } from './commands/run.js';

const program = new Command();

program
  .name('squish')
  .description('Universal Memory for AI Agents - CLI')
  .version('1.1.6');

// Register all commands
registerRememberCommand(program);
registerSearchCommand(program);
registerRecallCommand(program);
registerRecentCommand(program);
registerContextCommand(program);
registerStatsCommand(program);
registerForgetCommand(program);
registerLinkCommand(program);
registerStaleCommand(program);
registerCleanCommand(program);
registerMigrateCommand(program);
registerRunCommand(program);

// Default: show help if no arguments
if (process.argv.length === 2) {
  program.parse(['node', 'squish', '--help']);
} else {
  program.parse();
}
