/**
 * Codex session store - implements `AgentSessionStore`.
 *
 * Read-only access to the user's local Codex session database
 * (`~/.codex/state_5.sqlite`) so that `squish sessions list|search|show|related`
 * can return past Codex sessions.
 *
 * Storage format:
 *   - `~/.codex/state_5.sqlite` — SQLite database with `threads` table containing:
 *       id (TEXT, UUID), rollout_path (TEXT), created_at (REAL), updated_at (REAL),
 *       created_at_ms (INTEGER), updated_at_ms (INTEGER), cwd (TEXT), title (TEXT),
 *       first_user_message (TEXT), tokens_used (INTEGER), git_sha (TEXT),
 *       git_branch (TEXT), git_origin_url (TEXT), model_provider (TEXT),
 *       source (TEXT), cli_version (TEXT), model (TEXT), archived (INTEGER),
 *       has_user_event (INTEGER), preview (TEXT)
 *   - `~/.codex/sessions/<year>/<month>/<day>/rollout-*.json` — Full session data with:
 *       { session: { timestamp, id, instructions }, items: [{ role, content, type }] }
 *
 * The `rollout_path` in SQLite is a relative path from `~/.codex/`.
 *
 * Public surface consumed by:
 *   - core/sessions/store.ts (the public sessions surface)
 *   - packages/cli/src/commands/sessions.ts
 */
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
/**
 * Default location of the Codex data directory.
 * `~/.codex/` on all platforms including Windows.
 */
export declare function defaultCodexDir(): string;
/**
 * Path to the Codex SQLite database.
 */
export declare function defaultCodexDbPath(): string;
export interface CodexStoreOptions {
    /** Override the base directory (default: defaultCodexDir()) */
    codexDir?: string;
    /** Override the DB path (default: defaultCodexDbPath()) */
    dbPath?: string;
    /** Read-only connection (default: true) */
    readonly?: boolean;
}
export declare function closeCodexDb(): void;
export interface CodexDbStatus {
    ok: boolean;
    path: string | null;
    size_bytes: number | null;
    session_count: number | null;
    message_count: number | null;
    part_count: number | null;
    error?: string;
}
export declare function codexDbStatus(opts?: CodexStoreOptions): CodexDbStatus;
export interface ListCodexSessionsInput {
    limit?: number;
    offset?: number;
    directory_glob?: string;
}
export declare function listCodexSessions(input?: ListCodexSessionsInput, opts?: CodexStoreOptions): SessionGroup[];
export interface SearchCodexInput {
    query: string;
    limit?: number;
    depth?: 'text' | 'deep';
    directory_glob?: string;
    per_session_chunks?: number;
}
export declare function searchCodexSessions(input: SearchCodexInput, opts?: CodexStoreOptions): ChunkResult[];
export interface CodexSessionDetail extends SessionGroup {
    chunks: Chunk[];
}
export declare function getCodexSession(sessionId: string, opts?: CodexStoreOptions): CodexSessionDetail | null;
export interface FindCodexRelatedInput {
    repo_path?: string;
    files?: string[];
    limit?: number;
}
export declare function findCodexRelatedSessions(input: FindCodexRelatedInput, opts?: CodexStoreOptions): Array<{
    group: SessionGroup;
    score: number;
    reason: string;
}>;
/**
 * Codex-backed implementation of `AgentSessionStore`.
 *
 * Reads the user's local Codex SQLite database and rollout JSON files
 * to provide the same session search surface as the OpenCode and
 * Claude Code stores.
 */
export declare class CodexSessionStore implements AgentSessionStore {
    readonly name: AgentName;
    private optsFor;
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
    }): Promise<SessionGroup[]>;
    searchSessions(input: {
        query: string;
        limit?: number;
        depth?: 'text' | 'deep';
        directory_glob?: string;
        per_session_chunks?: number;
    }): Promise<Chunk[]>;
    getSession(id: string): Promise<{
        group: SessionGroup;
        chunks: Chunk[];
    } | null>;
    findRelatedSessions(input: {
        repo_path?: string;
        files?: string[];
        limit?: number;
    }): Promise<Array<{
        group: SessionGroup;
        score: number;
        reason: string;
    }>>;
}
//# sourceMappingURL=codex.d.ts.map