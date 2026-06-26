/**
 * Session chunk store (v1.5.5 - agent-stores adapter model).
 *
 * In v1.5.5 the sessions surface is exclusively for past agent
 * sessions - read via the `agent-stores` adapter layer. Long-term
 * memory (the captured-memories path) is no longer in scope of
 * `searchChunks` / `listSessions` / `getSessionChunks` /
 * `findRelatedSessions`; use `squish_recall` / `squish_remember`
 * (or the `squish` CLI's `remember` / `search` / `recall`) for
 * that.
 *
 * The capture path (`captureChunk` / `captureChunks`) remains
 * because the user can still run `squish sessions capture` to
 * persist a session summary. Those writes go to the same Squish
 * memory table that `squish_recall` searches.
 *
 * Tag scheme used by the capture path (memory-side):
 *   squish_chunk:<type>     -> marks this memory as a chunk
 *   squish_session:<id>     -> groups chunks into sessions
 *   agent:<agent>           -> agent identifier
 *   file:<path>             -> one tag per file referenced
 *
 * Type mapping (chunk -> Squish MemoryType):
 *   summary  -> note
 *   decision -> decision
 *   command  -> observation
 *   file     -> observation
 *   error    -> observation
 *   todo     -> task
 *
 * The plugin uses OpenCode's SDK for session discovery and shells
 * out to `squish remember` / `squish recall` for chunk persistence
 * and search. The CLI uses the public surface here to list, show,
 * search, capture, and find related.
 */
import { type AgentName } from './agent-stores/index.js';
import { opencodeDbStatus } from './opencode-store.js';
import type { Chunk, ChunkResult, ChunkType, SessionGroup } from './types.js';
export type { AgentName, AgentSessionStore, SessionSource } from './agent-stores/types.js';
interface StoreOptions {
    project?: string;
}
export declare function captureChunk(chunk: Chunk, opts?: StoreOptions): Promise<string>;
export declare function captureChunks(chunks: Chunk[], opts?: StoreOptions): Promise<string[]>;
export interface SearchChunksInput {
    query: string;
    limit?: number;
    project?: string;
    repo_path?: string;
    chunk_type?: ChunkType;
    /** Default 'all'. One of: opencode, claude-code, codex, all. */
    source?: import('./agent-stores/types.js').SessionSource;
    /** Optional override for opencode.db path. */
    opencode_db_path?: string;
    /** 'text' (default, fast) | 'deep' (all parts, slower). */
    depth?: 'text' | 'deep';
}
/**
 * Status of the opencode.db sidecar + source DB. CLI uses this to
 * tell the user "OpenCode history: 6,724 sessions available" so
 * the pull direction is visible.
 */
export declare function getOpenCodeStatus(input?: {
    db_path?: string;
}): import("./opencode-store.js").OpenCodeDbStatus;
export declare function searchChunks(input: SearchChunksInput): Promise<ChunkResult[]>;
export declare function getSessionChunks(sessionId: string, opts?: {
    source?: import('./agent-stores/types.js').SessionSource;
    opencode_db_path?: string;
}): Promise<SessionGroup | null>;
export interface ListSessionsInput {
    limit?: number;
    project?: string;
    source?: import('./agent-stores/types.js').SessionSource;
    opencode_db_path?: string;
    /** Directory glob to filter opencode sessions (case-insensitive substring). */
    directory_glob?: string;
}
export interface ListSessionsResult {
    sessions: SessionGroup[];
    /** Per-agent counts of how many sessions came back from each store. */
    sources: Record<AgentName, number>;
    /** Convenience: the opencode-specific status (or null if not requested). */
    opencode: ReturnType<typeof opencodeDbStatus>;
}
/**
 * Public list: iterates the registered agent stores and merges
 * their session groups, sorted by recency. Each store is queried
 * with `directory_glob` so the opencode side respects the filter
 * at the SQL level (rather than post-filtering in JS).
 */
export declare function listSessions(input?: ListSessionsInput): Promise<ListSessionsResult>;
export interface FindRelatedInput {
    repo_path: string;
    files?: string[];
    limit?: number;
    source?: import('./agent-stores/types.js').SessionSource;
    opencode_db_path?: string;
}
export interface RelatedResult {
    session: SessionGroup;
    score: number;
    matching_chunks: Chunk[];
    reason: string;
}
/**
 * Find past sessions related to a directory (and optional file
 * paths). Iterates the registered agent stores. Each store returns
 * `{ group, score, reason }` per the `AgentSessionStore` interface;
 * the public surface enriches the result with the matching chunks
 * (by calling `getSession` on each group).
 */
export declare function findRelatedSessions(input: FindRelatedInput): Promise<RelatedResult[]>;
//# sourceMappingURL=store.d.ts.map