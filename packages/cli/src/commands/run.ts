/**
 * Run Command - Start Squish web UI
 *
 * Usage:
 *   squish run web                   - Start web UI
 *   squish run web --port <port>    - Custom port (default: 37777)
 *   squish run web --open           - Open browser automatically
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { join } from 'path';

export function registerRunCommand(program: Command) {
  const run = new Command('run');
  run.description('Start Squish services');

  run
    .command('web')
    .description('Start Squish web UI')
    .option('-p, --port <port>', 'Port for web UI', '37777')
    .option('-o, --open', 'Open browser automatically', false)
    .action(async (options: any) => {
      const port = parseInt(options.port || '37777', 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Error: Invalid port number: ${options.port}`);
        process.exit(1);
      }

      const url = `http://localhost:${port}`;

      console.log(`\x1b[36mStarting Squish web UI on ${url}...\x1b[0m`);

      // Spawn bun to run the server - keep it in foreground like `bun run dev`
      const child = spawn('bun', ['run', 'webui/server.ts'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, SQUISH_WEB_PORT: String(port) }
      });

      // Handle browser open
      if (options.open) {
        const start = process.platform === 'darwin' ? 'open' : 
                      process.platform === 'win32' ? 'start' : 'xdg-open';
        setTimeout(() => spawn(start, [url], { detached: true }), 1500);
      }

      // Keep process alive and forward signals
      child.on('close', (code) => {
        process.exit(code || 0);
      });

      process.on('SIGINT', () => child.kill('SIGTERM'));
      process.on('SIGTERM', () => child.kill('SIGTERM'));
    });

  program.addCommand(run);
}