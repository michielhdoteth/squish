#!/usr/bin/env node
// Wrapper for squish remove command
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const scriptPath = join(__dirname, 'scripts', 'install-plugin.mjs');

// Add --uninstall flag
const child = spawn('node', [scriptPath, '--uninstall', ...args], {
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
