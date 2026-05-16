#!/usr/bin/env node
/**
 * Cleanup Hook - SessionEnd
 * 
 * Marks session as complete and triggers consolidation.
 * 
 * Input: JSON with { session_id, cwd }
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const cwd = data.cwd || process.cwd();
      
      if (process.env.DEBUG) {
        console.error(`[cleanup-hook] Session ending: ${data.session_id || 'unknown'}`);
      }
      
      // Run cleanup tasks in background:
      // 1. Consolidate memories
      // 2. Update session stats
      
      const squishBin = process.env.SQUISH_BIN || 'squish';
      
      // Run context to trigger session end processing
      spawn(squishBin, ['context'], {
        cwd,
        stdio: 'ignore',
        detached: true
      }).unref();
      
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    } catch (error) {
      console.error('Error:', error.message);
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  });
}

main();