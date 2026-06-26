/**
 * Session chunks - the searchable unit of session memory.
 *
 * A Session is a logical grouping of chunks. The chunk is the unit
 * stored, indexed, and retrieved. The plugin uses OpenCode's SDK
 * to discover past sessions; chunk data lives in the Squish memory
 * table with rich tags + metadata.
 *
 * Public surface consumed by:
 *   - packages/cli/src/commands/sessions.ts
 *   - OpenCode plugin (parallel refactor)
 *   - tests/core/sessions/*.test.ts
 */
export declare const CHUNK_TYPES: readonly ["summary", "decision", "command", "file", "error", "todo"];
export type ChunkType = (typeof CHUNK_TYPES)[number];
export declare const AGENT_IDS: readonly ["opencode", "claude-code", "openclaw", "codex", "cli", "manual"];
export type AgentId = (typeof AGENT_IDS)[number];
export declare const SESSION_STATUSES: readonly ["active", "completed", "errored"];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
/**
 * A Chunk is the SEARCHABLE unit. A session is a logical grouping
 * of chunks. Each chunk becomes one Squish memory with tags and
 * metadata that link it to a session.
 */
export interface Chunk {
    type: ChunkType;
    content: string;
    session_id: string;
    session_title: string;
    project: string;
    repo_path: string;
    branch: string;
    agent: AgentId;
    agent_session_id: string;
    files?: string[];
    timestamp: string;
}
/**
 * A ChunkResult is what search returns. NOT a whole session.
 */
export interface ChunkResult {
    chunk: Chunk;
    score: number;
    memory_id: string;
    why: string;
}
/**
 * A SessionGroup is a logical grouping. Built by aggregating chunks
 * that share session_id.
 */
export interface SessionGroup {
    session_id: string;
    title: string;
    project: string;
    repo_path: string;
    branch: string;
    agent: AgentId;
    started_at: string;
    ended_at: string | null;
    status: SessionStatus;
    chunk_count: number;
    chunks?: Chunk[];
}
//# sourceMappingURL=types.d.ts.map