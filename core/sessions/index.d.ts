/**
 * Barrel for the sessions module.
 *
 * Public surface consumed by:
 *   - packages/cli/src/commands/sessions.ts
 *   - OpenCode plugin (parallel refactor)
 *   - tests/core/sessions/*.test.ts
 *
 * v1.5.5: the `agent-stores` adapter layer is now part of the
 * public surface. Legacy callers can still import from
 * `core/sessions/opencode-store.js` (re-export shim) and
 * `core/sessions/store.js` (which now uses the registry).
 */
export * from './types.js';
export * from './chunker.js';
export * from './store.js';
export * from './opencode-store.js';
export * from './formatter.js';
export * from './agent-stores/index.js';
//# sourceMappingURL=index.d.ts.map