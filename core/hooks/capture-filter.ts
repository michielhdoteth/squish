/**
 * Capture Filter - Smart filtering of tool usage
 * 
 * Don't capture everything - filter out noise.
 * Only capture meaningful actions that warrant memory.
 */

import { logger } from '../logger.js';

/** Tool categories for capture */
export type ToolCategory = 
  | 'reading'
  | 'modification'
  | 'command'
  | 'commit'
  | 'testing'
  | 'search'
  | 'planning'
  | 'other';

/** Capture decision */
export interface CaptureDecision {
  shouldCapture: boolean;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Check if a tool should be captured
 * 
 * Rules:
 * - Write, Edit, MultiEdit → capture (modification)
 * - Bash with commit → capture (commit)
 * - Bash with test → capture (testing)  
 * - Task → capture (planning)
 * - Read, Glob, grep → skip (reading - too noisy)
 */
export function shouldCaptureTool(toolName: string): boolean {
  const decision = getCaptureDecision(toolName);
  return decision.shouldCapture;
}

/**
 * Get detailed capture decision
 */
export function getCaptureDecision(toolName: string): CaptureDecision {
  const tool = toolName.toLowerCase();
  
  // High priority - always capture
  if (['write', 'edit', 'multiedit'].includes(tool)) {
    return {
      shouldCapture: true,
      reason: 'File modification',
      priority: 'high',
    };
  }
  
  // Command with specific patterns
  if (tool === 'bash') {
    // Let the caller check the command for commit/test patterns
    return {
      shouldCapture: true, // Will be filtered by content check
      reason: 'Command execution',
      priority: 'medium',
    };
  }
  
  // Task operations
  if (['task', 'todowrite'].includes(tool)) {
    return {
      shouldCapture: true,
      reason: 'Task/planning activity',
      priority: 'high',
    };
  }
  
  // Skip noisy tools
  if (['read', 'glob', 'grep', 'websearch', 'webfetch', 'codesearch'].includes(tool)) {
    return {
      shouldCapture: false,
      reason: 'Reading/search tool - too noisy',
      priority: 'low',
    };
  }
  
  // Skip other common noise
  if (['bash'].includes(tool)) {
    return {
      shouldCapture: false, // Too noisy without filtering
      reason: 'General command - filtered',
      priority: 'low',
    };
  }
  
  // Default: don't capture unknown tools
  return {
    shouldCapture: false,
    reason: 'Unknown tool',
    priority: 'low',
  };
}

/**
 * Check if Bash command should be captured based on content
 */
export function shouldCaptureBashCommand(command: string): { capture: boolean; reason: string } {
  const cmd = command.toLowerCase();
  
  // Git commits - HIGH priority
  if (cmd.includes('git commit') || cmd.includes('git add') && cmd.includes('git commit')) {
    return { capture: true, reason: 'Git commit' };
  }
  
  // Tests - HIGH priority
  if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest') || 
      cmd.includes('pytest') || cmd.includes('bun test')) {
    return { capture: true, reason: 'Test execution' };
  }
  
  // Build/compile - MEDIUM priority
  if (cmd.includes('build') || cmd.includes('compile') || cmd.includes('tsc') ||
      cmd.includes('bun build') || cmd.includes('npm run build')) {
    return { capture: true, reason: 'Build/compile' };
  }
  
  // Installation - LOW priority
  if (cmd.includes('npm install') || cmd.includes('bun install') || 
      cmd.includes('pip install') || cmd.includes('yarn add')) {
    return { capture: false, reason: 'Package installation - too noisy' };
  }
  
  // Git operations (non-commit) - LOW priority
  if (cmd.includes('git') && !cmd.includes('commit')) {
    return { capture: false, reason: 'Git operations - not commits' };
  }
  
  // File operations - MEDIUM priority
  if (cmd.includes('mkdir') || cmd.includes('touch') || cmd.includes('rm ')) {
    return { capture: true, reason: 'File operation' };
  }
  
  // Default - don't capture
  return { capture: false, reason: 'General command' };
}

/**
 * Categorize tool for tagging
 */
export function categorizeTool(toolName: string): ToolCategory {
  const tool = toolName.toLowerCase();
  
  if (['write', 'edit', 'multiedit'].includes(tool)) {
    return 'modification';
  }
  
  if (tool === 'bash') {
    return 'command';
  }
  
  if (['read', 'glob', 'grep', 'websearch', 'webfetch'].includes(tool)) {
    return 'reading';
  }
  
  if (['task', 'todowrite', 'todo-read'].includes(tool)) {
    return 'planning';
  }
  
  return 'other';
}