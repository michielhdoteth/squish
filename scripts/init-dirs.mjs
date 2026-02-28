#!/usr/bin/env node

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const defaultDir = join(homedir(), '.squish');

if (!existsSync(defaultDir)) {
  mkdirSync(defaultDir, { recursive: true });
}

console.log(`Squish data directory: ${defaultDir}`);
