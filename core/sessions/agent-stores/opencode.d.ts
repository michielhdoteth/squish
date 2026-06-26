/**
 * OpenCode session store - implements `AgentSessionStore`.
 *
 * Read-only access to the user's local OpenCode session database
 * (`opencode.db`) so that `squish sessions list|search|show|related`
 * can return past OpenCode sessions. The CLI and the OpenCode plugin
 * use this same store; claude-code / codex stubs return empty results
 * until their own backends are implemented.
 *
 * Why read opencode.db directly:
 *   - 6,724 sessions already exist on the user's machine
 *   - OpenCode's own SDK (`input.client.session.list`) only sees ACTIVE
 *     sessions from inside the running OpenCode process; once the
 *     process exits, those references are gone. The DB is the only
 *     persistent record of past work.
 *   - The user wants to `squish sessions search <query>` and get back
 *     "what did I do in this repo / project last week?" - this is only
 *     possible against the on-disk DB.
 *
 * Performance notes:
 *   - 6,724 sessions in the session table is fast.
 *   - 1.35M parts in the part table. A LIKE search over ALL parts takes
 *     ~24s on the user's machine. We restrict to `type='text'` (133K
 *     parts) by default - that's ~2-3s and covers the bulk of useful
 *     content. `--depth deep` widens to all parts.
 *   - For a persistent FTS5 sidecar index, see `ensureSidecarFts()`
 *     (built lazily on first deep search; mtime-gated to refresh).
 *
 * Public surface consumed by:
 *   - core/sessions/store.ts (the public sessions surface)
 *   - packages/cli/src/commands/sessions.ts
 */
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
/**
 * Default location of the user's OpenCode database.
 * XDG-style: data lives at `~/.local/share/opencode/opencode.db` on
 * every platform, including Windows. The user's install confirms this
 * (6.77 GB at `~/.local/share/opencode/opencode.db`).
 *
 * Tests can set `SQUISH_OPENCODE_DISABLED=1` to force the opencode
 * source to be unavailable even if a real opencode.db exists on the
 * machine. The CLI does NOT set this; the user always gets the real
 * opencode.db unless they opt out.
 */
export declare function defaultOpenCodeDbPath(): string;
/**
 * Sidecar FTS5 index location. Built on first deep search.
 */
export declare function defaultSidecarPath(): string;
export interface OpenCodeStoreOptions {
    /** Override the DB path (default: defaultOpenCodeDbPath()) */
    dbPath?: string;
    /** Override the sidecar path (default: defaultSidecarPath()) */
    sidecarPath?: string;
    /** Read-only connection (default: true) */
    readonly?: boolean;
}
export declare function closeOpenCodeDb(): void;
export interface OpenCodeDbStatus {
    ok: boolean;
    path: string | null;
    size_bytes: number | null;
    session_count: number | null;
    message_count: number | null;
    part_count: number | null;
    error?: string;
}
export declare function opencodeDbStatus(opts?: OpenCodeStoreOptions): OpenCodeDbStatus;
export interface ListOpenCodeSessionsInput {
    limit?: number;
    /** Filter to sessions whose directory contains this substring (case-insensitive). */
    directory_glob?: string;
    /** Filter by agent (e.g. "build", "coder", "explore"). */
    agent?: string;
    /** Filter by project_id (exact). */
    project_id?: string;
}
export declare function listOpenCodeSessions(input?: ListOpenCodeSessionsInput, opts?: OpenCodeStoreOptions): SessionGroup[];
export interface SearchOpenCodeInput {
    query: string;
    limit?: number;
    /** 'text' (default, fast ~3s) | 'deep' (all parts, ~24s) */
    depth?: 'text' | 'deep';
    /** Optional directory filter. */
    directory_glob?: string;
    /** Max results per session (default 2 - summary + best match). */
    per_session_chunks?: number;
}
export declare function searchOpenCodeSessions(input: SearchOpenCodeInput, opts?: OpenCodeStoreOptions): ChunkResult[];
export interface OpenCodeSessionDetail extends SessionGroup {
    chunks: Chunk[];
    message_count: number;
    part_count: number;
}
export declare function getOpenCodeSession(sessionId: string, opts?: OpenCodeStoreOptions): OpenCodeSessionDetail | null;
export interface FindOpenCodeRelatedInput {
    repo_path: string;
    files?: string[];
    limit?: number;
}
export interface OpenCodeRelatedResult {
    session: SessionGroup;
    matching_chunks: Chunk[];
    score: number;
}
export declare function findOpenCodeRelatedSessions(input: FindOpenCodeRelatedInput, opts?: OpenCodeStoreOptions): OpenCodeRelatedResult[];
/**
 * Build a persistent FTS5 sidecar at `~/.squish/opencode-fts.db` from
 * the user's opencode.db. Reuses the existing sidecar if it is newer
 * than the source DB. After the sidecar is built, deep searches over
 * the full ~1.35M parts complete in <100ms instead of ~24s.
 *
 * Returns the path to the sidecar file. Idempotent.
 */
export declare function ensureSidecarFts(opts?: OpenCodeStoreOptions): string | null;
/**
 * Search using the sidecar FTS5 index. Falls back to LIKE search if
 * the sidecar is not built.
 */
export declare function searchOpenCodeSessionsFts(input: SearchOpenCodeInput, opts?: OpenCodeStoreOptions): ChunkResult[];
/**
 * OpenCode-backed implementation of `AgentSessionStore`.
 *
 * Pre-fers the persistent FTS5 sidecar (when available) so deep
 * searches are <100ms instead of ~24s. The sidecar is built lazily
 * on the first deep search; after that, mtime-gated refresh
 * keeps it in sync with opencode.db.
 */
export declare class OpenCodeSessionStore implements AgentSessionStore {
    readonly name: AgentName;
    /** Map adapter-level options to the opencode store's options. */
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
//# sourceMappingURL=opencode.d.ts.map