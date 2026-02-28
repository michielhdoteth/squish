#!/usr/bin/env node
/**
 * Hook Utilities - Shared functionality for Claude Code hooks
 * Eliminates duplication across session-start, session-end, user-prompt-submit, post-tool-use
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Read JSON context from stdin with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string>} - Stdin content
 */
export function readStdin(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let inputData = '';
    let hasInput = false;

    const stdinTimeout = setTimeout(() => {
      if (!hasInput) {
        resolve(''); // Resolve with empty string on timeout
      }
    }, timeoutMs);

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        inputData += chunk;
        hasInput = true;
      }
    });

    process.stdin.on('end', () => {
      clearTimeout(stdinTimeout);
      resolve(inputData);
    });

    process.stdin.on('error', (err) => {
      clearTimeout(stdinTimeout);
      reject(err);
    });
  });
}

/**
 * Parse Claude Code context from stdin data
 * @param {string} data - Raw stdin data
 * @returns {Object} - Parsed context or empty object
 */
export function parseClaudeContext(data) {
  if (!data || !data.trim()) {
    return {};
  }

  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Create standardized hook context from Claude Code data
 * @param {Object} claudeContext - Parsed Claude context
 * @param {boolean} includeUserMessage - Whether to include user message
 * @returns {Object} - Hook context
 */
export function createHookContext(claudeContext, includeUserMessage = false) {
  return {
    workingDirectory: claudeContext.cwd || process.cwd(),
    sessionId: claudeContext.session_id || 'unknown',
    ...(includeUserMessage && { userMessage: claudeContext.prompt }),
    config: {
      autoCapture: true,
      autoInject: true,
      generateFolderContext: true,
    },
  };
}

/**
 * Import plugin wrapper handler with error handling
 * @param {string} handlerName - Name of handler to import
 * @returns {Promise<Function|null>} - Handler function or null
 */
export async function importHandler(handlerName) {
  try {
    const modulePath = resolve(__dirname, '../dist/adapters/claude-code/plugin-wrapper.js');
    const module = await import(`file://${modulePath}`);
    return module[handlerName] || null;
  } catch (error) {
    console.error(`Failed to import ${handlerName}:`, error.message);
    return null;
  }
}

/**
 * Execute hook handler with standardized error handling
 * @param {Function|null} handler - Handler function
 * @param {Object} context - Hook context
 * @param {string} hookEventName - Name of hook event
 * @returns {Promise<Object>} - Hook result
 */
export async function executeHandler(handler, context, hookEventName) {
  if (!handler) {
    return {
      continue: true,
      hookSpecificOutput: { hookEventName },
    };
  }

  try {
    const result = await handler(context);
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName,
        ...(result && { additionalContext: result }),
      },
    };
  } catch (error) {
    console.error('Hook error:', error.message);
    return {
      continue: true,
      hookSpecificOutput: { hookEventName },
    };
  }
}

/**
 * Output standardized hook result
 * @param {Object} result - Hook result
 */
export function outputResult(result) {
  // Use console.log which automatically flushes
  // The key is to ensure no other output goes to stdout
  console.log(JSON.stringify(result));
}

/**
 * Handle fatal hook error
 * @param {Error} error - Error object
 */
export function handleFatalError(error) {
  console.error('Hook error:', error.message);
  process.exit(2);
}
