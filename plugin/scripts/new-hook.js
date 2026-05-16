#!/usr/bin/env node
/**
 * New Hook - UserPromptSubmit
 * 
 * Creates session context when user submits a prompt.
 * Records the prompt for context.
 * 
 * Input: JSON with { session_id, user_message_text, cwd }
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start session by calling squish context
 */
async function startSession(cwd) {
  return new Promise((resolve) => {
    const squishBin = process.env.SQUISH_BIN || 'squish';
    
    const child = spawn(squishBin, ['context'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: output.trim() });
      } else {
        resolve({ success: false, output: '' });
      }
    });
    
    child.on('error', () => resolve({ success: false, output: '' }));
  });
}

async function main() {
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const cwd = data.cwd || process.cwd();
      
      // Start session context in background
      const squishBin = process.env.SQUISH_BIN || 'squish';
      spawn(squishBin, ['context'], {
        cwd,
        stdio: 'ignore',
        detached: true
      }).unref();
      
      if (process.env.DEBUG) {
        const prompt = data.user_message_text || 'new prompt';
        console.error(`[new-hook] Session started for: ${prompt.substring(0, 50)}`);
      }
      
      // Suppress output for UserPromptSubmit hooks
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    } catch (error) {
      console.error('Error:', error.message);
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  });
}

main();