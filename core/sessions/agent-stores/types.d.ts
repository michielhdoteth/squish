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
export type AgentName = 'opencode' | 'claude-code' | 'codex' | 'gemini';
/**
 * Source filter for chunk/session queries. `opencode` reads the
 * user's local opencode.db. `claude-code` and `codex` read their
 * respective agent stores. `all` iterates every registered agent
 * store.
 */
export type SessionSource = AgentName | 'all';
/**
 * Interface for agent-specific session stores.
 * Each agent (opencode, claude-code, codex) implements this
 * to provide session/chunk search over its local data.
 */
export interface AgentSessionStore {
    readonly name: AgentName;
    available(): Promise<{
        ok: boolean;
        reason?: string;
        meta?: Record<string, unknown>;
    }>;
    status(): Promise<{
        path: string;
        size: number;
        sessions: number;
        messages: number;
        parts: number;
    } | null>;
    listSessions(opts?: {
        limit?: number;
        offset?: number;
        directory_glob?: string;
    }): Promise<import('../types.js').SessionGroup[]>;
    searchSessions(input: {
        query: string;
        limit?: number;
        depth?: 'text' | 'deep';
        directory_glob?: string;
        per_session_chunks?: number;
    }): Promise<import('../types.js').Chunk[]>;
    getSession(id: string): Promise<{
        group: import('../types.js').SessionGroup;
        chunks: import('../types.js').Chunk[];
    } | null>;
    findRelatedSessions(input: {
        repo_path?: string;
        files?: string[];
        limit?: number;
    }): Promise<Array<{
        group: import('../types.js').SessionGroup;
        score: number;
        reason: string;
    }>>;
}
//# sourceMappingURL=types.d.ts.map