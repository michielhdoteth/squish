/**
 * Barrel for the agent-stores adapter layer.
 *
 * Public surface consumed by:
 *   - core/sessions/store.ts (iterates the registry)
 *   - tests/core/sessions/agent-stores/registry.test.ts
 */
export * from './types.js';
export * from './registry.js';
export * from './cache.js';
export { OpenCodeSessionStore } from './opencode.js';
export { ClaudeCodeSessionStore } from './claude-code.js';
export { CodexSessionStore } from './codex.js';
export { GeminiSessionStore } from './gemini.js';
