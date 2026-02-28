#!/usr/bin/env node
/**
 * Squish Directory Initialization
 * Creates default data directories for npm-installed Squish
 */
import { mkdirSync, existsSync } from 'fs';
import { join, homedir } from 'path';

// Create ~/.squish (default global data directory)
const defaultDir = join(homedir(), '.squish');
if (!existsSync(defaultDir)) {
  mkdirSync(defaultDir, { recursive: true });
}

console.log(`Squish data directory: ${defaultDir}`);
