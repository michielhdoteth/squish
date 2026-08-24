/**
 * Gemini CLI session store - implements `AgentSessionStore`.
 *
 * Read-only access to the user's local Gemini CLI chat history
 * (`~/.gemini/tmp/<project-hash>/chats/session-*.json`).
 */
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
export declare function defaultGeminiDir(): string;
export interface GeminiStoreOptions {
    /** Override the base directory (default: defaultGeminiDir()) */
    geminiDir?: string;
}
export interface ListGeminiSessionsInput {
    limit?: number;
    offset?: number;
    directory_glob?: string;
}
export declare function listGeminiSessions(input?: ListGeminiSessionsInput, opts?: GeminiStoreOptions): SessionGroup[];
export interface SearchGeminiInput {
    query: string;
    limit?: number;
    depth?: 'text' | 'deep';
    directory_glob?: string;
    per_session_chunks?: number;
}
export declare function searchGeminiSessions(input: SearchGeminiInput, opts?: GeminiStoreOptions): Promise<ChunkResult[]>;
export interface GeminiSessionDetail extends SessionGroup {
    chunks: Chunk[];
    message_count: number;
}
export declare function getGeminiSession(sessionId: string, opts?: GeminiStoreOptions): Promise<GeminiSessionDetail | null>;
export declare function findGeminiRelatedSessions(input: {
    repo_path?: string;
    files?: string[];
    limit?: number;
}, opts?: GeminiStoreOptions): Promise<Array<{
    group: SessionGroup;
    score: number;
    reason: string;
}>>;
export interface GeminiDbStatus {
    ok: boolean;
    path: string | null;
    size_bytes: number | null;
    session_count: number | null;
    error?: string;
}
export declare function geminiDbStatus(opts?: GeminiStoreOptions): GeminiDbStatus;
export declare class GeminiSessionStore implements AgentSessionStore {
    readonly name: AgentName;
    private readonly storeOpts;
    constructor(opts?: GeminiStoreOptions);
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
    listSessions(listOpts?: {
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
