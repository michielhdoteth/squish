/**
 * Agent session cache - Batch 7.
 *
 * Read-through cache for parsed harness session stores. Harness session
 * files (claude-code JSONL transcripts, codex rollout JSONs, gemini chat
 * JSONs) can be large; re-parsing them on every search/show call wastes
 * work. This module stores the normalized `{ group, chunks }` payload in
 * the squish DB (`agent_session_cache` table) keyed by
 * `${agent}:${sessionId}`, invalidated by the source file's mtime + size.
 *
 * On a cache miss (fresh parse) the caller may pass the parsed chunks and
 * a project path; the commit then records working-set signals so session
 * ingestion (on-demand parsing) feeds the wake-up summary. Signal writes
 * are best-effort and never fail the read path.
 */

import fs from 'node:fs';

import { logger } from '../../logger.js';
import { getDbClient } from '../../lib/db-client.js';
import type { AgentName } from './types.js';
import type { Chunk, SessionGroup } from '../types.js';

export interface SessionCacheStat {
  mtimeMs: number;
  sizeBytes: number;
}

export function statSessionFile(filePath: string): SessionCacheStat | null {
  try {
    const stat = fs.statSync(filePath);
    return { mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
  } catch {
    return null;
  }
}

export interface CachedSessionPayload {
  group: SessionGroup;
  chunks: Chunk[];
}

interface CacheRow {
  cache_key: string;
  agent: string;
  session_id: string;
  source_path: string;
  mtime_ms: number;
  size_bytes: number;
  payload: string;
}

function cacheKey(agent: string, sessionId: string): string {
  return `${agent}:${sessionId}`;
}

/**
 * Read a cached parsed session if present and still fresh for the given
 * file stat. Returns null on miss or stale entry.
 */
export async function readSessionCache(
  agent: AgentName,
  sessionId: string,
  stat?: SessionCacheStat | null
): Promise<CachedSessionPayload | null> {
  if (!stat) return null;
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any).$client ?? raw;
    const row = sqlite
      .prepare('SELECT * FROM agent_session_cache WHERE cache_key = ?')
      .get(cacheKey(agent, sessionId)) as CacheRow | undefined;
    if (!row) return null;
    if (row.mtime_ms !== stat.mtimeMs || row.size_bytes !== stat.sizeBytes) return null;

    const payload = JSON.parse(row.payload) as CachedSessionPayload;
    if (!payload?.group || !Array.isArray(payload.chunks)) return null;
    return payload;
  } catch (err) {
    logger.debug(`[session-cache] read failed (${agent}:${sessionId}): ${err}`);
    return null;
  }
}

/**
 * Write/refresh a cached parsed session. Returns true when a fresh row was
 * written (i.e. this was a genuine parse worth recording as activity).
 */
export async function writeSessionCache(
  agent: AgentName,
  sessionId: string,
  sourcePath: string,
  stat: SessionCacheStat | null,
  payload: CachedSessionPayload
): Promise<boolean> {
  if (!stat) return false;
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any).$client ?? raw;
    sqlite
      .prepare(
        `INSERT INTO agent_session_cache
           (cache_key, agent, session_id, source_path, mtime_ms, size_bytes, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
         ON CONFLICT(cache_key) DO UPDATE SET
           source_path = excluded.source_path,
           mtime_ms = excluded.mtime_ms,
           size_bytes = excluded.size_bytes,
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      )
      .run(
        cacheKey(agent, sessionId),
        agent,
        sessionId,
        sourcePath,
        stat.mtimeMs,
        stat.sizeBytes,
        JSON.stringify(payload)
      );
    return true;
  } catch (err) {
    logger.debug(`[session-cache] write failed (${agent}:${sessionId}): ${err}`);
    return false;
  }
}

/**
 * Drop stale cache entries whose source file no longer exists or changed
 * beyond recognition. Called opportunistically; failures are ignored.
 */
export async function pruneSessionCache(agent: AgentName): Promise<void> {
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any).$client ?? raw;
    const rows = sqlite
      .prepare('SELECT cache_key, source_path FROM agent_session_cache WHERE agent = ?')
      .all(agent) as Array<{ cache_key: string; source_path: string }>;
    for (const row of rows) {
      if (!fs.existsSync(row.source_path)) {
        sqlite.prepare('DELETE FROM agent_session_cache WHERE cache_key = ?').run(row.cache_key);
      }
    }
  } catch (err) {
    logger.debug(`[session-cache] prune failed (${agent}): ${err}`);
  }
}
