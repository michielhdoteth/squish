/**
 * Agent-name source for session queries.
 *
 * v1.5.5: the sessions surface is now exclusively for past agent
 * sessions. Long-term memory is the job of `squish_recall` /
 * `squish_remember` — NOT the sessions CLI. The previous `squish`
 * source (captured-memories path) has been dropped from
 * `searchChunks` / `listSessions` / `getSessionChunks` /
 * `findRelatedSessions`.
 */
export type AgentName = 'opencode' | 'claude-code' | 'codex';

/**
 * Source filter for chunk/session queries. `opencode` reads the
 * user's local opencode.db. `claude-code` and `codex` read their
 * respective agent stores. `all` iterates every registered agent
 * store.
 */
export type SessionSource = AgentName | 'all';
