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

import {
  rememberMemory,
  search as squishSearch,
} from '../memory/memories.js';

import {
  availableAgentStores,
  getAgentStore,
  type AgentName,
} from './agent-stores/index.js';
import {
  getOpenCodeSession,
  opencodeDbStatus,
  searchOpenCodeSessionsFts,
} from './opencode-store.js';

import type {
  AgentId,
  Chunk,
  ChunkResult,
  ChunkType,
  SessionGroup,
} from './types.js';

const CHUNK_PREFIX = 'squish_chunk:';
const SESSION_PREFIX = 'squish_session:';
const AGENT_PREFIX = 'agent:';
const FILE_PREFIX = 'file:';

export type { AgentName, AgentSessionStore, SessionSource } from './agent-stores/types.js';

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
  /** Default 'all'. One of: opencode, claude-code, codex, all. */
  source?: import('./agent-stores/types.js').SessionSource;
  /** Optional override for opencode.db path. */
  opencode_db_path?: string;
  /** 'text' (default, fast) | 'deep' (all parts, slower). */
  depth?: 'text' | 'deep';
}

function clampLimit(n: number, max: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  if (n > max) return max;
  return Math.floor(n);
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
 * Resolve the list of agent names to query for a given source.
 * `all` expands to every registered agent; a specific name returns
 * just that one.
 */
function resolveSources(source: import('./agent-stores/types.js').SessionSource): AgentName[] {
  if (source === 'all') return availableAgentStores();
  return [source];
}

/**
 * Wraps a `Chunk` from an agent store into a `ChunkResult` with
 * a synthesized score (1 / rank-in-its-source) and a `why` line.
 * Different agents use different scoring scales; we just rank
 * within each source and let the merge step interleave.
 */
function chunkToResult(rank: number, chunk: Chunk, agent: AgentName): ChunkResult {
  return {
    chunk,
    score: 1 / (rank + 1),
    memory_id: `${agent}:${chunk.session_id}:${chunk.agent_session_id}`,
    why: `agent:${agent} - ${whyLine(chunk.content, chunk) || `matched in ${chunk.type} text`}`,
  };
}

export async function searchChunks(input: SearchChunksInput): Promise<ChunkResult[]> {
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const source: import('./agent-stores/types.js').SessionSource = input.source ?? 'all';
  const sources = resolveSources(source);

  const out: ChunkResult[] = [];

  for (const name of sources) {
    const store = getAgentStore(name);
    const available = await store.available().catch(() => ({ ok: false as const }));
    if (!available.ok) continue;

    // Per-source fetch: ask for `limit` hits, then wrap them as ChunkResult.
    const chunks = await store.searchSessions({
      query: input.query,
      limit,
      depth: input.depth,
      directory_glob: input.repo_path,
    });

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (input.chunk_type && c.type !== input.chunk_type) continue;
      out.push(chunkToResult(i, c, name));
      if (out.length >= limit) break;
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Session groupings                                                   */
/* ------------------------------------------------------------------ */

export async function getSessionChunks(
  sessionId: string,
  opts: { source?: import('./agent-stores/types.js').SessionSource; opencode_db_path?: string } = {}
): Promise<SessionGroup | null> {
  const source: import('./agent-stores/types.js').SessionSource = opts.source ?? 'all';
  const sources = resolveSources(source);

  for (const name of sources) {
    const store = getAgentStore(name);
    const available = await store.available().catch(() => ({ ok: false as const }));
    if (!available.ok) continue;
    const result = await store.getSession(sessionId).catch(() => null);
    if (result) {
      return { ...result.group, chunks: result.chunks };
    }
  }
  return null;
}

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
export async function listSessions(input: ListSessionsInput = {}): Promise<ListSessionsResult> {
  const limit = input.limit ?? 20;
  const source: import('./agent-stores/types.js').SessionSource = input.source ?? 'all';
  const sources = resolveSources(source);
  const groups: SessionGroup[] = [];
  const counts: Record<AgentName, number> = {
    'opencode': 0,
    'claude-code': 0,
    'codex': 0,
  };

  for (const name of sources) {
    const store = getAgentStore(name);
    const available = await store.available().catch(() => ({ ok: false as const }));
    if (!available.ok) continue;
    const list = await store.listSessions({ limit, directory_glob: input.directory_glob });
    for (const g of list) {
      groups.push(g);
      counts[name] += 1;
    }
  }

  const merged = Array.from(groups.values())
    .sort((a, b) => {
      const ae = a.ended_at ?? a.started_at;
      const be = b.ended_at ?? b.started_at;
      return be.localeCompare(ae);
    })
    .slice(0, limit);

  return {
    sessions: merged,
    sources: counts,
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
export async function findRelatedSessions(input: FindRelatedInput): Promise<RelatedResult[]> {
  const limit = input.limit ?? 5;
  const source: import('./agent-stores/types.js').SessionSource = input.source ?? 'all';
  const sources = resolveSources(source);

  const perSession = new Map<string, { session: SessionGroup; score: number; reason: string; chunks: Chunk[] }>();

  for (const name of sources) {
    const store = getAgentStore(name);
    const available = await store.available().catch(() => ({ ok: false as const }));
    if (!available.ok) continue;
    const results = await store.findRelatedSessions({
      repo_path: input.repo_path,
      files: input.files,
      limit: Math.max(limit, 20),
    });
    for (const r of results) {
      const existing = perSession.get(r.group.session_id);
      if (existing) {
        existing.score += r.score + 1; // boost when multiple agents agree
        if (existing.reason === '' || existing.reason !== r.reason) {
          existing.reason = `${existing.reason} + ${r.reason}`;
        }
        continue;
      }
      perSession.set(r.group.session_id, {
        session: r.group,
        score: r.score,
        reason: r.reason,
        chunks: [],
      });
    }
  }

  // Pull chunks for the top sessions. Cheap if the agent has an
  // indexed store (opencode.db is in-process; sub-millisecond).
  const topIds = Array.from(perSession.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => p.session.session_id);

  await Promise.all(
    topIds.map(async (id) => {
      const entry = perSession.get(id);
      if (!entry) return;
      for (const name of sources) {
        const store = getAgentStore(name);
        const detail = await store.getSession(id).catch(() => null);
        if (detail) {
          entry.chunks = detail.chunks;
          return;
        }
      }
    })
  );

  const out: RelatedResult[] = [];
  for (const entry of perSession.values()) {
    out.push({
      session: entry.session,
      score: entry.score,
      matching_chunks: entry.chunks,
      reason: entry.reason,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
