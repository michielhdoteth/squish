#!/usr/bin/env node
/**
 * Save Hook - PostToolUse
 * 
 * Captures tool usage observations by calling squish remember CLI.
 * Must be fast - spawns child process and returns immediately.
 * 
 * Input: JSON with { session_id, tool_name, tool_input, tool_output, cwd }
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tool-to-content mapping
function buildContent(data) {
  const { tool_name, tool_input, tool_output } = data;
  
  // File modifications
  if (tool_name === 'write') {
    return `Created file: ${tool_input.file_path || tool_input.path || 'unknown'}`;
  }
  if (tool_name === 'edit') {
    return `Edited file: ${tool_input.file_path || tool_input.path || 'unknown'}`;
  }
  if (tool_name === 'multiedit') {
    return `Multi-edited: ${tool_input.file_path || 'unknown'}`;
  }
  
  // Bash commands - extract the command
  if (tool_name === 'bash' || tool_name === 'Shell' || tool_name === 'Terminal') {
    const cmd = tool_input.command || tool_input.cmd || '';
    if (cmd.includes('git commit')) return `Git commit: ${cmd.substring(0, 100)}`;
    if (cmd.includes('git add')) return `Git staged files`;
    if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest')) {
      return `Ran tests: ${cmd.substring(0, 100)}`;
    }
    if (cmd.includes('npm') || cmd.includes('bun') || cmd.includes('pnpm')) {
      // Skip noisy package manager output - just track high-level
      return `Package command: ${cmd.split(' ')[0]} ${cmd.split(' ')[1] || ''}`;
    }
    return `Executed: ${cmd.substring(0, 80)}`;
  }
  
  // Task operations
  if (tool_name === 'Task' || tool_name === 'todowrite') {
    return `Task: ${tool_input.description || tool_input.name || 'new task'}`;
  }
  
  // Search tools - skip (too noisy)
  if (['Read', 'Glob', 'grep', 'WebSearch', 'WebFetch', 'grep', 'codesearch'].includes(tool_name)) {
    return null; // Skip - not worth capturing
  }
  
  // Default - capture key info
  const filePath = tool_input.file_path || tool_input.path || tool_input.description || '';
  if (filePath) {
    return `${tool_name}: ${filePath}`;
  }
  return `${tool_name} executed`;
}

// Determine learning type based on output
function getLearningType(tool_name, tool_output) {
  const output = String(tool_output || '').toLowerCase();
  if (output.includes('error') || output.includes('fail') || output.includes('exception')) {
    return 'failure';
  }
  if (tool_name === 'write' || tool_name === 'edit') {
    return 'success';
  }
  return 'insight';
}

// Tool-to-place mapping for auto-assignment
function getPlace(tool_name, content) {
  if (tool_name === 'write' || tool_name === 'edit' || tool_name === 'multiedit') {
    return 'wip';
  }
  if (content && /\b(test|assertionerror|traceback|exception|experiment)\b/i.test(content)) {
    return 'sandbox';
  }
  if (content && /\b(hypothesis|plan|decided|roadmap|task|todo)\b/i.test(content)) {
    return 'board';
  }
  if (content && /\b(research|docs|pattern|reference|api)\b/i.test(content)) {
    return 'ref';
  }
  if (content && /\b(idea|explore|future|concept)\b/i.test(content)) {
    return 'sparks';
  }
  return null; // Let squish auto-detect
}

async function main() {
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      
      // Skip noisy tools
      if (['Read', 'Glob', 'grep', 'WebSearch', 'WebFetch', 'codesearch'].includes(data.tool_name)) {
        console.log(JSON.stringify({ continue: true, suppressOutput: true }));
        return;
      }
      
      const content = buildContent(data);
      if (!content) {
        console.log(JSON.stringify({ continue: true, suppressOutput: true }));
        return;
      }
      
      const learningType = getLearningType(data.tool_name, data.tool_output);
      const cwd = data.cwd || process.cwd();
      const place = getPlace(data.tool_name, content);
      
      // Build squish remember command
      const squishBin = process.env.SQUISH_BIN || 'squish';
      const args = ['remember', content, '--route', 'learning', '--learning-type', learningType];
      
      if (place) {
        args.push('--place', place);
      }
      
      // Spawn squish remember in background - don't wait for it
      const child = spawn(squishBin, args, {
        cwd,
        stdio: 'ignore',
        detached: true
      });
      
      child.unref();
      
      // Log for debugging (stderr goes to console.error)
      if (process.env.DEBUG) {
        console.error(`[save-hook] Captured: ${content} (${learningType}${place ? ', place: ' + place : ''})`);
      }
      
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    } catch (error) {
      console.error('Error:', error.message);
      // Don't fail the hook - graceful degradation
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  });
}

main();