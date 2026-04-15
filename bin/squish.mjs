#!/usr/bin/env node

/**
 * Squish CLI - Main Entry Point
 * Universal Memory for AI Agents
 * 
 * Usage:
 *   squish remember "Store this memory"
 *   squish search "query"
 *   squish learn fix "Fixed bug in auth"
 *   squish context --list-projects
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use bun to run the CLI directly with ts support
const { spawn } = await import('child_process');
const bunPath = process.env.BUN?.replace(/\\/g, '/') || 'bun';
const cliPath = join(__dirname, '..', 'packages', 'cli', 'src', 'index.ts');

const args = process.argv.slice(2);
const child = spawn(bunPath, [cliPath, ...args], {
  stdio: 'inherit',
  cwd: join(__dirname, '..')
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
