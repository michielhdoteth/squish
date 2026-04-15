/**
 * Run Command - Start various Squish services
 * 
 * Usage:
 *   squish run web           - Start web UI
 *   squish run web --port    - Custom port
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { join } from 'path';

export function registerRunCommand(program: Command) {
  const run = new Command('run');
  run.description('Start Squish services');

  // squish run web
  run
    .command('web')
    .description('Start Squish web UI')
    .option('-p, --port <port>', 'Port for web UI', '37777')
    .option('-o, --open', 'Open browser automatically', false)
    .action(async (options: any) => {
      const port = parseInt(options.port, 10);
      
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Error: Invalid port number: ${options.port}`);
        process.exit(1);
      }

      console.log(`Starting Squish web UI on port ${port}...`);
      console.log(`Press Ctrl+C to stop\n`);

      // Set port env var for the web server
      const webuiPath = join(process.cwd(), 'webui', 'server.ts');
      
      const child = spawn('bun', [webuiPath], {
        env: { ...process.env, SQUISH_WEB_PORT: String(port) },
        stdio: 'inherit'
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Web UI exited with code ${code}`);
          process.exit(code || 1);
        }
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        console.log('\nStopping web UI...');
        child.kill('SIGTERM');
        process.exit(0);
      });
    });

  program.addCommand(run);
}