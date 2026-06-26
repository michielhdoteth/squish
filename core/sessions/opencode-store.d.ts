/**
 * Re-export shim for the opencode agent store.
 *
 * The actual implementation lives in `core/sessions/agent-stores/opencode.ts`.
 * This shim exists for back-compat with code that imports from
 * `core/sessions/opencode-store.js` directly. Tests and the public
 * `core/sessions/store.ts` should use the new path; external callers
 * can keep using this one.
 */
export * from './agent-stores/opencode.js';
export { OpenCodeSessionStore } from './agent-stores/opencode.js';
//# sourceMappingURL=opencode-store.d.ts.map