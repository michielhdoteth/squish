import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const installerPath = path.resolve(__dirname, '../../../../bin/install-interactive.mjs');

async function runInstaller(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installerPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}

export function registerInstallCommand(program: Command): void {
  const installCommand = new Command('install')
    .description('Install Squish integrations and MCP configuration')
    .allowUnknownOption(true)
    .argument('[installerArgs...]', 'Arguments forwarded to the installer')
    .action(async (installerArgs: string[] = []) => {
      const exitCode = await runInstaller(installerArgs);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });

  program.addCommand(installCommand);
  program.command('install-plugin [installerArgs...]')
    .description('Alias for install')
    .allowUnknownOption(true)
    .action(async (installerArgs: string[] = []) => {
      const exitCode = await runInstaller(installerArgs);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}
