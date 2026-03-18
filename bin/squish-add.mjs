#!/usr/bin/env node
// Wrapper for squish commands - launches interactive mode when no args
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

// If no args, launch interactive installer
if (args.length === 0) {
  const interactivePath = join(__dirname, '..', 'scripts', 'install-interactive.mjs');
  const child = spawn('node', [interactivePath], {
    stdio: 'inherit',
    shell: false
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  // Pass through to install-plugin.mjs
  const scriptPath = join(__dirname, '..', 'scripts', 'install-plugin.mjs');
  const child = spawn('node', [scriptPath, ...args], {
    stdio: 'inherit',
    shell: false
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
