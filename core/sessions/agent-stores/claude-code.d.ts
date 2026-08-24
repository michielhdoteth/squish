/**
 * Claude Code session store - implements `AgentSessionStore`.
 *
 * Read-only access to the user's local Claude Code session logs
 * (`~/.claude/history.jsonl` and `~/.claude/projects/<hash>/*.jsonl`)
 * so that `squish sessions list|search|show|related` can return past
 * Claude Code sessions.
 *
 * Storage format:
 *   - `~/.claude/history.jsonl` — session index. Each line is:
 *       { display, pastedContents, timestamp (epoch ms), project (Windows path), sessionId }
 *   - `~/.claude/projects/<project-hash>/<session-id>.jsonl` — messages.
 *       Each line has: { type, message, uuid, timestamp, ... }
 *     User messages:      { type: "user", message: { role: "user", content: "..." } }
 *     Assistant messages: { type: "assistant", message: { role: "assistant", content: [...] } }
 *
 * Project hash: the project path with `:` and `\` replaced by `-`.
 *   e.g. `C:\Users\user\projects\my-app` -> `C--Users-user-projects-my-app`
 *
 * Public surface consumed by:
 *   - core/sessions/store.ts (the public sessions surface)
 *   - packages/cli/src/commands/sessions.ts
 */
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
/**
 * Default location of the Claude Code data directory.
 * `~/.claude/` on all platforms including Windows.
 */
export declare function defaultClaudeDir(): string;
export interface ClaudeCodeStoreOptions {
    /** Override the base directory (default: defaultClaudeDir()) */
    claudeDir?: string;
}
export interface ClaudeCodeDbStatus {
    ok: boolean;
    path: string | null;
    size_bytes: number | null;
    session_count: number | null;
    message_count: number | null;
    part_count: number | null;
    error?: string;
}
export declare function claudeCodeDbStatus(opts?: ClaudeCodeStoreOptions): ClaudeCodeDbStatus;
export interface ListClaudeCodeSessionsInput {
    limit?: number;
    offset?: number;
    directory_glob?: string;
}
export declare function listClaudeCodeSessions(input?: ListClaudeCodeSessionsInput, opts?: ClaudeCodeStoreOptions): SessionGroup[];
export interface SearchClaudeCodeInput {
    query: string;
    limit?: number;
    depth?: 'text' | 'deep';
    directory_glob?: string;
    per_session_chunks?: number;
}
export declare function searchClaudeCodeSessions(input: SearchClaudeCodeInput, opts?: ClaudeCodeStoreOptions): Promise<ChunkResult[]>;
export interface ClaudeCodeSessionDetail extends SessionGroup {
    chunks: Chunk[];
    message_count: number;
}
export declare function getClaudeCodeSession(sessionId: string, opts?: ClaudeCodeStoreOptions): Promise<ClaudeCodeSessionDetail | null>;
export declare function findClaudeCodeRelatedSessions(input: {
    repo_path?: string;
    files?: string[];
    limit?: number;
}, opts?: ClaudeCodeStoreOptions): Promise<Array<{
    group: SessionGroup;
    score: number;
    reason: string;
}>>;
/**
 * Claude Code-backed implementation of `AgentSessionStore`.
 *
 * Reads the user's local Claude Code history index and per-session
 * JSONL message files to provide the same session search surface as
 * the OpenCode store.
 */
export declare class ClaudeCodeSessionStore implements AgentSessionStore {
    readonly name: AgentName;
    private readonly storeOpts;
    constructor(opts?: ClaudeCodeStoreOptions);
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
//# sourceMappingURL=claude-code.d.ts.map