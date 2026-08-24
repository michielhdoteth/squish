/**
 * Agent session cache - Batch 7.
 *
 * Read-through cache for parsed harness session stores, keyed by
 * `${agent}:${sessionId}`, invalidated by source file mtime + size.
 */
import type { AgentName } from './types.js';
import type { Chunk, SessionGroup } from '../types.js';
export interface SessionCacheStat {
    mtimeMs: number;
    sizeBytes: number;
}
export declare function statSessionFile(filePath: string): SessionCacheStat | null;
export interface CachedSessionPayload {
    group: SessionGroup;
    chunks: Chunk[];
}
/**
 * Read a cached parsed session if present and still fresh for the given
 * file stat. Returns null on miss or stale entry.
 */
export declare function readSessionCache(agent: AgentName, sessionId: string, stat?: SessionCacheStat | null): Promise<CachedSessionPayload | null>;
/**
 * Write/refresh a cached parsed session. Returns true when a fresh row was
 * written (i.e. this was a genuine parse worth recording as activity).
 */
export declare function writeSessionCache(agent: AgentName, sessionId: string, sourcePath: string, stat: SessionCacheStat | null, payload: CachedSessionPayload): Promise<boolean>;
/**
 * Drop stale cache entries whose source file no longer exists.
 */
export declare function pruneSessionCache(agent: AgentName): Promise<void>;
