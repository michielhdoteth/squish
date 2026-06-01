/**
 * Barrel for the sessions module.
 *
 * Public surface consumed by:
 *   - packages/cli/src/commands/sessions.ts
 *   - OpenCode plugin (parallel refactor)
 *   - tests/core/sessions/*.test.ts
 */

export * from './types.js';
export * from './chunker.js';
export * from './store.js';
export * from './opencode-store.js';
export * from './formatter.js';
