/**
 * Session chunk store.
 *
 * Chunks are stored as Squish memories (rich tags + metadata) via
 * the existing rememberMemory / search / getMemory APIs. There is
 * NO parallel file-IO index for sessions - the Squish memory table
 * is the source of truth.
 *
 * Tag scheme (used to filter and group):
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
 * The plugin discovers past sessions via OpenCode's SDK. The CLI
 * uses the public surface here to list, show, search, capture,
 * find related, and build inject blocks.
 */

import {
  rememberMemory,
  search as squishSearch,
  getMemory,
} from '../memory/memories.js';
import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';

import {
  searchOpenCodeSessionsFts,
  listOpenCodeSessions,
  getOpenCodeSession,
  findOpenCodeRelatedSessions,
  opencodeDbStatus,
  type OpenCodeStoreOptions,
} from './opencode-store.js';

import type {
  AgentId,
  Chunk,
  ChunkResult,
  ChunkType,
  SessionGroup,
  SessionStatus,
} from './types.js';

const CHUNK_PREFIX = 'squish_chunk:';
const SESSION_PREFIX = 'squish_session:';
const AGENT_PREFIX = 'agent:';
const FILE_PREFIX = 'file:';

/**
 * Source filter for chunk/session queries. `squish` is the manually-
 * captured store. `opencode` reads the user's local opencode.db
 * (history of every past session). `all` merges both, deduping
 * identical session_ids.
 */
export type SessionSource = 'squish' | 'opencode' | 'all';

const CHUNK_TYPE_TO_MEMORY: Record<ChunkType, string> = {
  summary: 'note',
  decision: 'decision',
  command: 'observation',
  file: 'observation',
  error: 'observation',
  todo: 'task',
};

interface StoreOptions {
  project?: string;
}

function chunkTypeTag(t: ChunkType): string {
  return `${CHUNK_PREFIX}${t}`;
}

function sessionIdTag(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function agentTag(a: AgentId): string {
  return `${AGENT_PREFIX}${a}`;
}

function fileTag(p: string): string {
  return `${FILE_PREFIX}${p}`;
}

function buildTags(chunk: Chunk): string[] {
  const out: string[] = [chunkTypeTag(chunk.type), sessionIdTag(chunk.session_id), agentTag(chunk.agent)];
  if (chunk.files && chunk.files.length > 0) {
    for (const f of chunk.files) {
      if (f && f.length > 0) out.push(fileTag(f));
    }
  }
  return out;
}

function buildMetadata(chunk: Chunk): Record<string, unknown> {
  return {
    session_id: chunk.session_id,
    session_title: chunk.session_title,
    chunk_type: chunk.type,
    agent: chunk.agent,
    agent_session_id: chunk.agent_session_id,
    repo_path: chunk.repo_path,
    branch: chunk.branch,
    files: chunk.files ?? [],
    timestamp: chunk.timestamp,
  };
}

function projectFor(chunk: Chunk, opts: StoreOptions): string | undefined {
  return opts.project ?? chunk.project ?? undefined;
}

function memoryIdFromRecord(rec: { id: string }): string {
  return rec.id;
}

function chunkFromMemory(args: {
  id: string;
  content: string;
  type: string;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt?: string | null;
}): Chunk | null {
  const md = args.metadata ?? {};
  const sessionId = typeof md.session_id === 'string' ? md.session_id : null;
  if (!sessionId) return null;
  const sessionTitle = typeof md.session_title === 'string' ? md.session_title : '';
  const project =
    typeof md.project === 'string'
      ? md.project
      : typeof (args.metadata ?? {}).project === 'string'
        ? ((args.metadata ?? {}).project as string)
        : '';
  const repoPath = typeof md.repo_path === 'string' ? md.repo_path : '';
  const branch = typeof md.branch === 'string' ? md.branch : '';
  const agent = typeof md.agent === 'string' ? (md.agent as AgentId) : 'manual';
  const agentSessionId = typeof md.agent_session_id === 'string' ? md.agent_session_id : '';
  const chunkType = typeof md.chunk_type === 'string' ? (md.chunk_type as ChunkType) : null;
  if (!chunkType) return null;
  const files = Array.isArray(md.files) ? (md.files as string[]) : undefined;
  const timestamp =
    typeof md.timestamp === 'string' && md.timestamp.length > 0
      ? md.timestamp
      : args.createdAt ?? new Date().toISOString();
  return {
    type: chunkType,
    content: args.content,
    session_id: sessionId,
    session_title: sessionTitle,
    project,
    repo_path: repoPath,
    branch,
    agent,
    agent_session_id: agentSessionId,
    ...(files ? { files } : {}),
    timestamp,
  };
}

function isChunkMemory(md: Record<string, unknown> | null | undefined): boolean {
  if (!md) return false;
  return typeof md.session_id === 'string' && typeof md.chunk_type === 'string';
}

function whyLine(query: string, chunk: Chunk): string {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) {
    return `matched in ${chunk.type} text`;
  }
  const lower = chunk.content.toLowerCase();
  for (const t of tokens) {
    if (lower.includes(t)) {
      return `matched '${t}' in ${chunk.type} text`;
    }
  }
  const meta = `${chunk.session_title} ${chunk.repo_path} ${chunk.branch} ${(chunk.files ?? []).join(' ')}`.toLowerCase();
  for (const t of tokens) {
    if (meta.includes(t)) {
      return `matched '${t}' in ${chunk.type} metadata`;
    }
  }
  return `matched in ${chunk.type} text`;
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

export async function captureChunk(chunk: Chunk, opts: StoreOptions = {}): Promise<string> {
  const rec = await rememberMemory({
    content: chunk.content,
    type: CHUNK_TYPE_TO_MEMORY[chunk.type] as any,
    tags: buildTags(chunk),
    project: projectFor(chunk, opts),
    metadata: buildMetadata(chunk),
    source: `session_chunk:${chunk.session_id}`,
    sessionId: chunk.session_id,
  });
  return memoryIdFromRecord(rec);
}

export async function captureChunks(chunks: Chunk[], opts: StoreOptions = {}): Promise<string[]> {
  const ids: string[] = [];
  for (const c of chunks) {
    const id = await captureChunk(c, opts);
    ids.push(id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 10;

export interface SearchChunksInput {
  query: string;
  limit?: number;
  project?: string;
  repo_path?: string;
  chunk_type?: ChunkType;
  /** Default 'all'. Use 'squish' to search only the captured store, 'opencode' for only the local OpenCode db. */
  source?: SessionSource;
  /** Optional override for opencode.db path. */
  opencode_db_path?: string;
}

/**
 * Status of the opencode.db sidecar + source DB. CLI uses this to
 * tell the user "OpenCode history: 6,724 sessions available" so
 * the pull direction is visible.
 */
export function getOpenCodeStatus(input: { db_path?: string } = {}) {
  return opencodeDbStatus({ dbPath: input.db_path });
}

/**
 * Build an OpenCodeStoreOptions from a search/list input.
 * Returns `null` when the opencode source is not requested.
 */
function opencodeOptsFor(input: { opencode_db_path?: string }, source: SessionSource): OpenCodeStoreOptions | null {
  if (source === 'squish') return null;
  const opts: OpenCodeStoreOptions = { readonly: true };
  if (input.opencode_db_path) opts.dbPath = input.opencode_db_path;
  return opts;
}

export async function searchChunks(input: SearchChunksInput): Promise<ChunkResult[]> {
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const source: SessionSource = input.source ?? 'all';

  const out: ChunkResult[] = [];
  let outForSource: ChunkResult[] = [];

  // 1) Squish memory store
  if (source === 'squish' || source === 'all') {
    const fetchLimit = Math.max(limit * 4, 30);
    const raw = await squishSearch({
      query: input.query,
      limit: fetchLimit,
      project: input.project,
    });

    for (const r of raw) {
      if (outForSource.length >= limit) break;
      if (!isChunkMemory(r.metadata)) continue;
      const tags = r.tags ?? [];
      if (!tags.some((t) => t.startsWith(CHUNK_PREFIX))) continue;
      const chunkType = (r.metadata as Record<string, unknown>).chunk_type as ChunkType;
      if (input.chunk_type && chunkType !== input.chunk_type) continue;
      if (input.repo_path) {
        const recRepo = (r.metadata as Record<string, unknown>).repo_path;
        if (typeof recRepo === 'string' && recRepo !== input.repo_path) continue;
      }
      const chunk = chunkFromMemory({
        id: r.id,
        content: r.content,
        type: r.type,
        tags,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt ?? null,
      });
      if (!chunk) continue;
      outForSource.push({
        chunk,
        score: typeof r.similarity === 'number' ? r.similarity : 0,
        memory_id: r.id,
        why: whyLine(input.query, chunk),
      });
    }
    outForSource.sort((a, b) => b.score - a.score);
  }

  if (source === 'squish') {
    return outForSource.slice(0, limit);
  }

  // 2) OpenCode local DB (lazy FTS5 sidecar)
  const ocOpts = opencodeOptsFor(input, source);
  const openCodeResults: ChunkResult[] = ocOpts
    ? safeOpenCodeSearch(input.query, limit, ocOpts)
    : [];

  // 3) Merge: dedupe by (session_id, content-prefix) and interleave by score.
  // The squish memory and opencode DB are independent stores with
  // different scoring scales, so we do a stable interleave rather
  // than a score-fused merge. OpenCode results get a small bonus so
  // they show alongside captured chunks when both exist for the same
  // session.
  const seen = new Set<string>();
  const merged: ChunkResult[] = [];
  for (const r of outForSource) {
    const key = `${r.chunk.session_id}::${r.chunk.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  for (const r of openCodeResults) {
    const key = `${r.chunk.session_id}::${r.chunk.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...r, score: r.score + 0.001 }); // small bonus so it sorts near the top
  }
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

function safeOpenCodeSearch(query: string, limit: number, opts: OpenCodeStoreOptions): ChunkResult[] {
  try {
    return searchOpenCodeSessionsFts({ query, limit, depth: 'text' }, opts);
  } catch (err) {
    logger.debug(`[sessions] opencode search error: ${err}`);
    return [];
  }
}

function clampLimit(n: number, max: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  if (n > max) return max;
  return Math.floor(n);
}

/* ------------------------------------------------------------------ */
/* Session groupings                                                   */
/* ------------------------------------------------------------------ */

export async function getSessionChunks(
  sessionId: string,
  opts: { source?: SessionSource; opencode_db_path?: string } = {}
): Promise<SessionGroup | null> {
  const source: SessionSource = opts.source ?? 'all';

  if (source === 'squish' || source === 'all') {
    const fromSquish = await getSessionChunksFromSquish(sessionId);
    if (fromSquish) return fromSquish;
    if (source === 'squish') return null;
  }

  if (source === 'opencode' || source === 'all') {
    return getSessionChunksFromOpenCode(sessionId, opts.opencode_db_path);
  }
  return null;
}

async function getSessionChunksFromSquish(sessionId: string): Promise<SessionGroup | null> {
  // Walk recent memories and filter by session_id tag. Search is unreliable
  // for this since the session id is a UUID-like opaque token. Direct DB
  // query is more robust.
  const client = await getDbClient();
  const raw = client.$client as any;
  const rows: any[] = [];
  try {
    if (raw && typeof raw.prepare === 'function') {
      const stmt = raw.prepare(
        `SELECT id, content, type, tags, metadata, created_at
         FROM memories
         WHERE tags LIKE ?
         ORDER BY created_at ASC`
      );
      const tag = sessionIdTag(sessionId);
      const matches = stmt.all(`%${JSON.stringify(tag).slice(1, -1)}%`) as any[];
      // tags may be JSON array or comma-list; safer to load all and post-filter.
      rows.push(...matches);
    } else if (raw && typeof raw.query === 'function') {
      // PostgreSQL path
      const result = await raw.query(
        `SELECT id, content, type, tags, metadata, created_at
         FROM memories
         WHERE $1 = ANY(tags)
         ORDER BY created_at ASC`,
        [sessionIdTag(sessionId)]
      );
      rows.push(...(result.rows ?? []));
    }
  } catch (err) {
    logger.debug(`[sessions] getSessionChunks DB error: ${err}`);
    return null;
  }

  const chunks: Chunk[] = [];
  for (const row of rows) {
    const tags = parseTagsColumn(row.tags);
    if (!tags.includes(sessionIdTag(sessionId))) continue;
    let meta: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        meta = null;
      }
    }
    const chunk = chunkFromMemory({
      id: row.id,
      content: row.content,
      type: row.type,
      tags,
      metadata: meta,
      createdAt: row.created_at,
    });
    if (chunk) chunks.push(chunk);
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  // Note: returns the SessionGroup below.

  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  return {
    session_id: sessionId,
    title: first.session_title,
    project: first.project,
    repo_path: first.repo_path,
    branch: first.branch,
    agent: first.agent,
    started_at: first.timestamp,
    ended_at: last.timestamp !== first.timestamp ? last.timestamp : null,
    status: 'completed',
    chunk_count: chunks.length,
    chunks,
  };
}

function parseTagsColumn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function getSessionChunksFromOpenCode(sessionId: string, dbPath?: string): SessionGroup | null {
  try {
    const detail = getOpenCodeSession(sessionId, { dbPath });
    if (!detail) return null;
    return {
      session_id: detail.session_id,
      title: detail.title,
      project: detail.project,
      repo_path: detail.repo_path,
      branch: detail.branch,
      agent: detail.agent,
      started_at: detail.started_at,
      ended_at: detail.ended_at,
      status: detail.status,
      chunk_count: detail.chunk_count,
      chunks: detail.chunks,
    };
  } catch (err) {
    logger.debug(`[sessions] getSessionChunksFromOpenCode error: ${err}`);
    return null;
  }
}

export interface ListSessionsInput {
  limit?: number;
  project?: string;
  source?: SessionSource;
  opencode_db_path?: string;
  /** Directory glob to filter opencode sessions (case-insensitive substring). */
  directory_glob?: string;
}

export async function listSessionGroups(input: ListSessionsInput = {}): Promise<SessionGroup[]> {
  const limit = input.limit ?? 20;
  const client = await getDbClient();
  const raw = client.$client as any;

  // Fetch a generous recent pool, filter to chunk memories, group by session_id.
  const fetchLimit = Math.max(limit * 10, 100);
  const rows: any[] = [];
  try {
    if (raw && typeof raw.prepare === 'function') {
      const stmt = raw.prepare(
        `SELECT id, content, type, tags, metadata, created_at
         FROM memories
         ORDER BY created_at DESC
         LIMIT ?`
      );
      rows.push(...(stmt.all(fetchLimit) as any[]));
    } else if (raw && typeof raw.query === 'function') {
      const result = await raw.query(
        `SELECT id, content, type, tags, metadata, created_at
         FROM memories
         ORDER BY created_at DESC
         LIMIT $1`,
        [fetchLimit]
      );
      rows.push(...(result.rows ?? []));
    }
  } catch (err) {
    logger.debug(`[sessions] listSessionGroups DB error: ${err}`);
    return [];
  }

  const groups = new Map<string, SessionGroup>();
  for (const row of rows) {
    const tags = parseTagsColumn(row.tags);
    if (!tags.some((t) => t.startsWith(CHUNK_PREFIX))) continue;
    let meta: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        meta = null;
      }
    }
    const chunk = chunkFromMemory({
      id: row.id,
      content: row.content,
      type: row.type,
      tags,
      metadata: meta,
      createdAt: row.created_at,
    });
    if (!chunk) continue;
    if (input.project && chunk.project !== input.project) continue;
    const existing = groups.get(chunk.session_id);
    if (!existing) {
      groups.set(chunk.session_id, {
        session_id: chunk.session_id,
        title: chunk.session_title,
        project: chunk.project,
        repo_path: chunk.repo_path,
        branch: chunk.branch,
        agent: chunk.agent,
        started_at: chunk.timestamp,
        ended_at: null,
        status: 'completed',
        chunk_count: 1,
      });
    } else {
      existing.chunk_count += 1;
      if (chunk.timestamp.localeCompare(existing.started_at) < 0) {
        existing.started_at = chunk.timestamp;
      }
      const lastStamp = existing.ended_at ?? existing.started_at;
      if (chunk.timestamp.localeCompare(lastStamp) > 0) {
        existing.ended_at = chunk.timestamp;
      }
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      const ae = a.ended_at ?? a.started_at;
      const be = b.ended_at ?? b.started_at;
      return be.localeCompare(ae);
    })
    .slice(0, limit);
}

/**
 * Public list: merges squish captured groups with the user's local
 * opencode.db history. Dedupes by session_id, sorts by recency.
 */
export async function listSessions(input: ListSessionsInput = {}): Promise<{
  sessions: SessionGroup[];
  sources: { squish: number; opencode: number };
  opencode: ReturnType<typeof opencodeDbStatus>;
}> {
  const limit = input.limit ?? 20;
  const source: SessionSource = input.source ?? 'all';
  const groups: SessionGroup[] = [];
  let squishCount = 0;
  let opencodeCount = 0;

  if (source === 'squish' || source === 'all') {
    const squishGroups = await listSessionGroups({ limit: Math.max(limit, 50), project: input.project });
    groups.push(...squishGroups);
    squishCount = squishGroups.length;
  }

  if (source === 'opencode' || source === 'all') {
    const ocOpts = opencodeOptsFor(input, source);
    if (ocOpts) {
      try {
        const ocList = listOpenCodeSessions(
          {
            limit: Math.max(limit, 50),
            directory_glob: input.directory_glob,
          },
          ocOpts
        );
        for (const g of ocList) {
          groups.push(g);
          opencodeCount += 1;
        }
      } catch (err) {
        logger.debug(`[sessions] listSessions opencode error: ${err}`);
      }
    }
  }

  // Dedup by session_id, prefer the opencode group (it has full
  // started_at/ended_at range from the DB).
  const byId = new Map<string, SessionGroup>();
  for (const g of groups) {
    const existing = byId.get(g.session_id);
    if (!existing) {
      byId.set(g.session_id, g);
      continue;
    }
    // Merge: keep the one with the most chunks.
    if ((g.chunk_count ?? 0) > (existing.chunk_count ?? 0)) {
      byId.set(g.session_id, g);
    }
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => {
      const ae = a.ended_at ?? a.started_at;
      const be = b.ended_at ?? b.started_at;
      return be.localeCompare(ae);
    })
    .slice(0, limit);

  return {
    sessions: merged,
    sources: { squish: squishCount, opencode: opencodeCount },
    opencode: opencodeDbStatus(),
  };
}

/* ------------------------------------------------------------------ */
/* Related                                                             */
/* ------------------------------------------------------------------ */

export interface FindRelatedInput {
  repo_path: string;
  files?: string[];
  limit?: number;
  source?: SessionSource;
  opencode_db_path?: string;
}

export interface RelatedResult {
  session: SessionGroup;
  score: number;
  matching_chunks: Chunk[];
}

export async function findRelatedSessions(input: FindRelatedInput): Promise<RelatedResult[]> {
  const limit = input.limit ?? 5;
  const source: SessionSource = input.source ?? 'all';
  const terms: string[] = [];
  if (input.repo_path) terms.push(input.repo_path);
  if (input.files) {
    for (const f of input.files) terms.push(f);
  }
  const query = terms.join(' ').trim() || input.repo_path;

  // Group by session_id, score by overlap of files and repo_path.
  const perSession = new Map<string, { session: SessionGroup; score: number; chunks: Chunk[]; files: Set<string> }>();

  // 1) Squish captured store
  if (source === 'squish' || source === 'all') {
    const pool = await squishSearch({
      query,
      limit: Math.max(limit * 10, 50),
    });

    for (const r of pool) {
      if (!isChunkMemory(r.metadata)) continue;
      const tags = r.tags ?? [];
      if (!tags.some((t) => t.startsWith(CHUNK_PREFIX))) continue;
      const meta = r.metadata as Record<string, unknown>;
      const recRepo = typeof meta.repo_path === 'string' ? meta.repo_path : '';
      if (recRepo !== input.repo_path) continue;
      const chunk = chunkFromMemory({
        id: r.id,
        content: r.content,
        type: r.type,
        tags,
        metadata: meta,
        createdAt: r.createdAt ?? null,
      });
      if (!chunk) continue;

      let entry = perSession.get(chunk.session_id);
      if (!entry) {
        entry = {
          session: {
            session_id: chunk.session_id,
            title: chunk.session_title,
            project: chunk.project,
            repo_path: chunk.repo_path,
            branch: chunk.branch,
            agent: chunk.agent,
            started_at: chunk.timestamp,
            ended_at: null,
            status: 'completed',
            chunk_count: 0,
          },
          score: 0,
          chunks: [],
          files: new Set(),
        };
        perSession.set(chunk.session_id, entry);
      }
      entry.session.chunk_count += 1;
      if (chunk.timestamp.localeCompare(entry.session.started_at) < 0) {
        entry.session.started_at = chunk.timestamp;
      }
      const lastStamp = entry.session.ended_at ?? entry.session.started_at;
      if (chunk.timestamp.localeCompare(lastStamp) > 0) {
        entry.session.ended_at = chunk.timestamp;
      }
      entry.chunks.push(chunk);
      const fileOverlap = countFileOverlap(chunk.files ?? [], input.files ?? []);
      entry.score += (typeof r.similarity === 'number' ? r.similarity : 0) * 2 + fileOverlap * 3;
      for (const f of chunk.files ?? []) entry.files.add(f);
    }
  }

  // 2) OpenCode local DB - find sessions in the same directory, then
  //    score by file overlap from tool/patch parts.
  if (source === 'opencode' || source === 'all') {
    try {
      const ocResults = findOpenCodeRelatedSessions(
        { repo_path: input.repo_path, files: input.files, limit: Math.max(limit, 20) },
        { dbPath: input.opencode_db_path, readonly: true }
      );
      for (const r of ocResults) {
        const existing = perSession.get(r.session.session_id);
        if (existing) {
          // Boost the existing entry's score (opencode is authoritative
          // for the directory match).
          existing.score += 1 + r.score * 2;
          for (const c of r.matching_chunks) {
            if (!existing.chunks.some((ec) => ec.content === c.content)) {
              existing.chunks.push(c);
            }
          }
        } else {
          perSession.set(r.session.session_id, {
            session: r.session,
            score: 1 + r.score * 2,
            chunks: r.matching_chunks.slice(),
            files: new Set(r.matching_chunks.flatMap((c) => c.files ?? [])),
          });
        }
      }
    } catch (err) {
      logger.debug(`[sessions] findRelatedSessions opencode error: ${err}`);
    }
  }

  const out: RelatedResult[] = [];
  for (const [, entry] of perSession) {
    out.push({
      session: entry.session,
      score: entry.score,
      matching_chunks: entry.chunks,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function countFileOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let n = 0;
  for (const f of a) {
    if (setB.has(f)) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Inject                                                              */
/* ------------------------------------------------------------------ */

export interface BuildInjectInput {
  maxChars?: number;
  source?: SessionSource;
  opencode_db_path?: string;
}

export async function buildInjectText(
  sessionId: string,
  opts: BuildInjectInput = {}
): Promise<string | null> {
  const group = await getSessionChunks(sessionId, { source: opts.source, opencode_db_path: opts.opencode_db_path });
  if (!group || !group.chunks || group.chunks.length === 0) return null;
  const max = opts.maxChars ?? 4000;

  const lines: string[] = [];
  lines.push(`### Related past session: ${group.title || group.session_id}`);
  lines.push('');

  const summary = group.chunks.find((c) => c.type === 'summary');
  if (summary) {
    lines.push(summary.content);
    lines.push('');
  }

  const grouped: Record<ChunkType, Chunk[]> = {
    summary: [],
    decision: [],
    command: [],
    file: [],
    error: [],
    todo: [],
  };
  for (const c of group.chunks) grouped[c.type].push(c);

  if (grouped.decision.length > 0) {
    lines.push('**Decisions:**');
    for (const d of grouped.decision) lines.push(`- ${d.content}`);
    lines.push('');
  }
  if (grouped.file.length > 0) {
    lines.push(`**Files touched:** ${grouped.file.map((f) => f.content).join(', ')}`);
    lines.push('');
  }
  if (grouped.command.length > 0) {
    lines.push('**Commands:**');
    for (const c of grouped.command) lines.push(`- ${c.content}`);
    lines.push('');
  }
  if (grouped.error.length > 0) {
    lines.push('**Errors:**');
    for (const e of grouped.error) lines.push(`- ${e.content}`);
    lines.push('');
  }
  if (grouped.todo.length > 0) {
    lines.push('**Todos:**');
    for (const t of grouped.todo) lines.push(`- ${t.content}`);
    lines.push('');
  }

  lines.push(`(session ${group.session_id} from ${group.started_at})`);

  let out = lines.join('\n');
  if (out.length > max) out = out.slice(0, max - 1) + '\u2026';
  return out;
}
