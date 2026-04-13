/**
 * Auto-Tagger - Infer tags from context
 * 
 * Analyzes tool input/output to automatically infer relevant tags.
 * Uses pattern matching to classify actions.
 */

import type { ToolCategory } from './capture-filter.js';

/**
 * Infer tags based on tool, input, and content
 */
export function inferTags(
  toolName: string,
  toolInput: Record<string, unknown>,
  content: string
): string[] {
  const tags: string[] = ['hook', 'autocapture']; // Always add these
  
  const tool = toolName.toLowerCase();
  const inputStr = JSON.stringify(toolInput).toLowerCase();
  const contentLower = content.toLowerCase();
  
  // File type tags
  if (tool === 'write' || tool === 'edit') {
    const filePath = String(toolInput.filePath || toolInput.path || '');
    
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      tags.push('typescript');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      tags.push('javascript');
    } else if (filePath.endsWith('.json')) {
      tags.push('config');
    } else if (filePath.endsWith('.md')) {
      tags.push('documentation');
    } else if (filePath.endsWith('.test.ts') || filePath.endsWith('.spec.ts')) {
      tags.push('test');
    }
    
    // Feature/fix detection
    if (contentLower.includes('fix') || contentLower.includes('bug')) {
      tags.push('bugfix');
    } else if (contentLower.includes('refactor')) {
      tags.push('refactor');
    } else if (contentLower.includes('feature') || contentLower.includes('add')) {
      tags.push('feature');
    } else if (contentLower.includes('test')) {
      tags.push('testing');
    }
  }
  
  // Bash command tags
  if (tool === 'bash') {
    const cmd = String(toolInput.command || toolInput.cmd || '');
    
    if (cmd.includes('git commit')) {
      tags.push('commit', 'version-control');
    } else if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest')) {
      tags.push('testing', 'test');
    } else if (cmd.includes('build') || cmd.includes('compile')) {
      tags.push('build');
    } else if (cmd.includes('install')) {
      tags.push('dependencies');
    } else if (cmd.includes('lint') || cmd.includes('format')) {
      tags.push('linting');
    }
  }
  
  // Task tags
  if (tool === 'task' || tool === 'todowrite') {
    tags.push('task', 'planning');
    
    if (contentLower.includes('fix') || contentLower.includes('bug')) {
      tags.push('bugfix');
    } else if (contentLower.includes('feature')) {
      tags.push('feature');
    } else if (contentLower.includes('refactor')) {
      tags.push('refactor');
    }
  }
  
  // Deduplicate
  return [...new Set(tags)];
}

/**
 * Extract tags from commit message
 */
export function extractCommitTags(commitMessage: string): string[] {
  const tags: string[] = ['commit'];
  const msg = commitMessage.toLowerCase();
  
  // Conventional commits
  if (msg.startsWith('feat:') || msg.includes('feature')) {
    tags.push('feature', 'conventional-commit');
  } else if (msg.startsWith('fix:') || msg.includes('bugfix')) {
    tags.push('bugfix', 'conventional-commit');
  } else if (msg.startsWith('refactor:')) {
    tags.push('refactor', 'conventional-commit');
  } else if (msg.startsWith('docs:')) {
    tags.push('documentation', 'conventional-commit');
  } else if (msg.startsWith('test:')) {
    tags.push('testing', 'conventional-commit');
  } else if (msg.startsWith('chore:')) {
    tags.push('chore', 'conventional-commit');
  }
  
  return tags;
}

/**
 * Extract tags from file path
 */
export function extractFileTags(filePath: string): string[] {
  const tags: string[] = [];
  const path = filePath.toLowerCase();
  
  // By extension
  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    tags.push('typescript');
  } else if (path.endsWith('.js') || path.endsWith('.jsx')) {
    tags.push('javascript');
  } else if (path.endsWith('.py')) {
    tags.push('python');
  } else if (path.endsWith('.go')) {
    tags.push('golang');
  } else if (path.endsWith('.rs')) {
    tags.push('rust');
  } else if (path.endsWith('.java')) {
    tags.push('java');
  } else if (path.endsWith('.json')) {
    tags.push('config');
  } else if (path.endsWith('.md')) {
    tags.push('documentation');
  }
  
  // By directory pattern
  if (path.includes('/test') || path.includes('/tests') || path.includes('__tests__')) {
    tags.push('test');
  } else if (path.includes('/src/')) {
    tags.push('source');
  } else if (path.includes('/lib/') || path.includes('/utils/')) {
    tags.push('library');
  } else if (path.includes('/config/') || path.includes('/scripts/')) {
    tags.push('config');
  }
  
  return tags;
}