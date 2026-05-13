#!/usr/bin/env node
/**
 * Context Hook - SessionStart
 * 
 * Reads stdin JSON, queries Squish for recent memories,
 * and outputs formatted context for IDE injection.
 * 
 * Input: JSON with { session_id, cwd, hook_event_name, source }
 * Output: Markdown context to stdout for IDE injection
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get memories using squish CLI
 */
async function getRecentMemories(cwd, limit = 5) {
  return new Promise((resolve) => {
    const squishBin = process.env.SQUISH_BIN || 'squish';
    
    const child = spawn(squishBin, ['recent', '--limit', String(limit), '--period', 'today'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    
    child.on('close', (code) => {
      if (code === 0) {
        try {
          // Try to parse as JSON first
          const json = JSON.parse(output);
          resolve(json.results || []);
        } catch {
          // Fall back to raw output
          resolve(output.trim().split('\n').filter(Boolean));
        }
      } else {
        resolve([]);
      }
    });
    
    child.on('error', () => resolve([]));
  });
}

/**
 * Get stats using squish CLI
 */
async function getStats(cwd) {
  return new Promise((resolve) => {
    const squishBin = process.env.SQUISH_BIN || 'squish';
    
    const child = spawn(squishBin, ['stats'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    
    child.on('close', () => {
      try {
        const json = JSON.parse(output);
        resolve(json);
      } catch {
        resolve(null);
      }
    });
    
    child.on('error', () => resolve(null));
  });
}

async function main() {
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const cwd = data.cwd || process.cwd();
      
      // Get recent memories and stats in parallel
      const [memories, stats] = await Promise.all([
        getRecentMemories(cwd, 5),
        getStats(cwd)
      ]);
      
      // Build context output
      let context = '';
      
      if (stats && stats.totalMemories > 0) {
        context += `# [squish-memory] session context\n\n`;
        context += `Total memories: ${stats.totalMemories} | Learnings: ${stats.learnings || 0}\n\n`;
      }
      
      if (memories.length > 0) {
        context += `## Recent memories\n\n`;
        
        if (Array.isArray(memories)) {
          memories.slice(0, 5).forEach((mem, i) => {
            const type = mem.type || 'memory';
            const content = mem.content || String(mem);
            const short = content.length > 80 ? content.substring(0, 80) + '...' : content;
            context += `${i + 1}. [${type}] ${short}\n`;
          });
        } else {
          // Raw text output
          context += memories.slice(0, 5).map((m, i) => `${i + 1}. ${m}`).join('\n') + '\n';
        }
        
        context += `\n*Use \`squish recall "query"\` to search more*\n`;
      } else {
        context += `# [squish-memory] session context\n\n`;
        context += `No memories yet for this project.\n\n`;
        context += `Start working and I'll capture your decisions and observations automatically.\n`;
      }
      
      // Output to stdout for IDE injection
      console.log(context);
      
    } catch (error) {
      console.error('Error:', error.message);
      // Output empty context on error
      console.log('# [squish-memory] session context\n\n');
    }
  });
}

main();