/**
 * Gemini CLI session store - implements `AgentSessionStore`.
 *
 * Read-only access to the user's local Gemini CLI chat history
 * (`~/.gemini/tmp/<project-hash>/chats/session-*.json`) so that
 * `squish sessions list|search|show|related` can return past
 * Gemini CLI sessions.
 *
 * Storage format (verified against gemini-cli):
 *   - `~/.gemini/tmp/<hash>/chats/session-<ts><id8>.json` — one JSON doc:
 *       { sessionId, projectHash, startTime, lastUpdated,
 *         messages: [{ id, timestamp (ISO), type: 'user' | 'gemini', content }] }
 *   - `<hash>` is a sha256-derived project directory name. The exact hash
 *     input is not documented and is not reversible from the stored data,
 *     so `repo_path` is unknown for these sessions; `directory_glob`
 *     matching falls back to sha256 variants of the requested path and
 *     substring match on the hash.
 *
 * Public surface consumed by:
 *   - core/sessions/store.ts (the public sessions surface)
 *   - packages/cli/src/commands/sessions.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

import { logger } from '../../logger.js';
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
import { readSessionCache, statSessionFile, writeSessionCache } from './cache.js';
import { recordParsedSessionSignals } from '../../session/working-set.js';

// ---------------------------------------------------------------------------
// Path discovery
// ---------------------------------------------------------------------------

export function defaultGeminiDir(): string {
  if (process.env.SQUISH_GEMINI_DISABLED === '1') {
    return path.join(os.homedir(), '.squish', 'gemini-disabled-for-tests');
  }
  return path.join(os.homedir(), '.gemini');
}

export interface GeminiStoreOptions {
  /** Override the base directory (default: defaultGeminiDir()) */
  geminiDir?: string;
}

function geminiBase(opts: GeminiStoreOptions = {}): string {
  return opts.geminiDir ?? defaultGeminiDir();
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface GeminiMessage {
  id?: string;
  timestamp?: string;
  type?: string;
  content?: string;
}

interface GeminiSessionDoc {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  messages?: GeminiMessage[];
}

function cleanText(s: string | undefined): string {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim();
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function deriveProjectName(directory: string): string {
  if (!directory) return '';
  const norm = directory.replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm === '/' || /^[A-Z]:$/.test(norm)) return directory;
  const parts = norm.split('/').filter(Boolean);
  return parts[parts.length - 1] || directory;
}

/**
 * Find all gemini chat files: `tmp/<hash>/chats/session-*.json`.
 */
function findSessionFiles(geminiDir: string): Array<{ filePath: string; hash: string }> {
  const tmpDir = path.join(geminiDir, 'tmp');
  if (!fs.existsSync(tmpDir)) return [];
  const out: Array<{ filePath: string; hash: string }> = [];
  try {
    for (const hashDir of fs.readdirSync(tmpDir)) {
      const chatsDir = path.join(tmpDir, hashDir, 'chats');
      if (!fs.existsSync(chatsDir)) continue;
      for (const file of fs.readdirSync(chatsDir)) {
        if (!file.startsWith('session-') || !file.endsWith('.json')) continue;
        out.push({ filePath: path.join(chatsDir, file), hash: hashDir });
      }
    }
  } catch (err) {
    logger.debug(`[gemini-store] failed to scan tmp dir: ${err}`);
  }
  return out.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function readSessionDoc(filePath: string): GeminiSessionDoc | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as GeminiSessionDoc;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    logger.debug(`[gemini-store] failed to read ${filePath}: ${err}`);
    return null;
  }
}

function sessionIdFromDoc(doc: GeminiSessionDoc, filePath: string): string {
  if (doc.sessionId) return doc.sessionId;
  // Fall back to the file stem: session-2025-09-23T01-46-4398d5dc.json
  return path.basename(filePath, '.json');
}

function groupFromDoc(
  doc: GeminiSessionDoc,
  filePath: string,
  messageCount: number
): SessionGroup {
  const sessionId = sessionIdFromDoc(doc, filePath);
  const started = isoOrNull(doc.startTime) ?? isoOrNull(fsStatMtimeIso(filePath)) ?? new Date(0).toISOString();
  const updated = isoOrNull(doc.lastUpdated);
  return {
    session_id: sessionId,
    title: firstUserText(doc)?.slice(0, 200) || sessionId,
    project: (doc.projectHash ?? '').slice(0, 12),
    repo_path: '',
    branch: '',
    agent: 'gemini',
    started_at: started,
    ended_at: updated && updated !== started ? updated : null,
    status: 'completed',
    chunk_count: messageCount,
  };
}

function fsStatMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

/** First user message text (session title source). */
function firstUserText(doc: GeminiSessionDoc): string {
  for (const m of doc.messages ?? []) {
    if (m.type === 'user') {
      const text = cleanText(m.content);
      if (text) return text;
    }
  }
  return '';
}

/** Conservative message filter: user + gemini text only. */
function usableMessages(doc: GeminiSessionDoc): GeminiMessage[] {
  return (doc.messages ?? []).filter((m) => {
    if (typeof m?.content !== 'string') return false;
    if (m.type !== 'user' && m.type !== 'gemini') return false;
    return cleanText(m.content).length > 0;
  });
}

function messagesToChunks(doc: GeminiSessionDoc, group: SessionGroup, maxChunks = 10): Chunk[] {
  const chunks: Chunk[] = [];
  let count = 0;
  for (const m of usableMessages(doc)) {
    if (count >= maxChunks) break;
    const content = cleanText(m.content).slice(0, 500);
    if (!content) continue;
    chunks.push({
      type: m.type === 'user' && count === 0 ? 'summary' : 'file',
      content,
      session_id: group.session_id,
      session_title: group.title,
      project: group.project,
      repo_path: group.repo_path,
      branch: '',
      agent: 'gemini',
      agent_session_id: group.session_id,
      timestamp: isoOrNull(m.timestamp) ?? group.started_at,
    });
    count++;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Cached parse layer (mirrors claude-code adapter)
// ---------------------------------------------------------------------------

interface SessionText {
  role: string;
  text: string;
  ts: number;
}

const MAX_CACHED_TEXT_CHARS = 24_000;

async function loadParsedChat(
  filePath: string,
  opts: { cacheWrite?: boolean } = {}
): Promise<{ group: SessionGroup; chunks: Chunk[]; texts: SessionText[] } | null> {
  const rawDoc = readSessionDoc(filePath);
  if (!rawDoc?.sessionId && !fs.existsSync(filePath)) return null;

  const stat = statSessionFile(filePath);
  const cached = await readSessionCache('gemini', sessionIdFromDoc(rawDoc ?? {}, filePath), stat);
  if (cached && Array.isArray((cached as any).texts)) {
    return cached as unknown as { group: SessionGroup; chunks: Chunk[]; texts: SessionText[] };
  }

  const doc = rawDoc ?? {};
  const group = groupFromDoc(doc, filePath, usableMessages(doc).length);
  const texts: SessionText[] = usableMessages(doc).map((m) => ({
    role: m.type ?? 'unknown',
    text: cleanText(m.content),
    ts: Date.parse(m.timestamp ?? '') || Date.parse(doc.startTime ?? '') || 0,
  }));
  const chunks = messagesToChunks(doc, group);

  if (opts.cacheWrite !== false && stat) {
    const bounded: SessionText[] = [];
    let budget = MAX_CACHED_TEXT_CHARS;
    for (const t of texts) {
      if (budget <= 0) break;
      const text = t.text.length > 2000 ? `${t.text.slice(0, 2000)}…` : t.text;
      budget -= text.length;
      bounded.push({ ...t, text });
    }
    await writeSessionCache('gemini', group.session_id, filePath, stat, {
      group,
      chunks,
      texts: bounded,
    } as any);
    // Batch 7 review (I-1): awaited so short-lived CLI processes persist
    // signals before exit (no-op today - gemini hash dirs cannot be
    // reversed to a projectPath, but the contract holds for callers).
    await recordParsedSessionSignals({
      sessionId: `gemini:${group.session_id}`,
      projectPath: undefined,
      chunks: chunks.map((c) => ({ type: c.type, content: c.content })),
    });
  }

  return { group, chunks, texts };
}

// ---------------------------------------------------------------------------
// List sessions
// ---------------------------------------------------------------------------

export interface ListGeminiSessionsInput {
  limit?: number;
  offset?: number;
  directory_glob?: string;
}

/**
 * The tmp hash directories cannot be reversed to paths, so a directory
 * filter matches when ANY sha256 variant of the requested path equals a
 * known hash, or when the glob appears inside the hash string.
 */
function matchesDirectory(geminiDir: string, hash: string, directoryGlob: string): boolean {
  const lower = directoryGlob.toLowerCase();
  if (hash.toLowerCase().includes(lower.replace(/[^a-z0-9]/g, ''))) return true;
  for (const variant of hashVariants(directoryGlob)) {
    if (variant === hash) return true;
  }
  void geminiDir;
  return false;
}

function hashVariants(projectPath: string): string[] {
  const variants = new Set<string>();
  const base = projectPath.trim();
  const candidates = [
    base,
    base.toLowerCase(),
    base.replace(/\\/g, '/'),
    base.replace(/\\/g, '/').toLowerCase(),
    base.replace(/\//g, '\\'),
  ];
  for (const candidate of candidates) {
    try {
      variants.add(createHash('sha256').update(candidate).digest('hex'));
    } catch {
      // ignore
    }
  }
  return [...variants];
}

export function listGeminiSessions(
  input: ListGeminiSessionsInput = {},
  opts: GeminiStoreOptions = {}
): SessionGroup[] {
  const files = findSessionFiles(geminiBase(opts));
  const limit = Math.max(1, Math.min(input.limit ?? 20, 200));
  const offset = Math.max(0, input.offset ?? 0);

  const groups: SessionGroup[] = [];
  for (const { filePath, hash } of files) {
    if (input.directory_glob && !matchesDirectory(geminiBase(opts), hash, input.directory_glob)) {
      continue;
    }
    const doc = readSessionDoc(filePath);
    if (!doc) continue;
    groups.push(groupFromDoc(doc, filePath, usableMessages(doc).length));
  }

  groups.sort((a, b) => (b.ended_at ?? b.started_at).localeCompare(a.ended_at ?? a.started_at));
  return groups.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Search sessions
// ---------------------------------------------------------------------------

export interface SearchGeminiInput {
  query: string;
  limit?: number;
  depth?: 'text' | 'deep';
  directory_glob?: string;
  per_session_chunks?: number;
}

export async function searchGeminiSessions(
  input: SearchGeminiInput,
  opts: GeminiStoreOptions = {}
): Promise<ChunkResult[]> {
  if (!input.query || input.query.trim().length === 0) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 8, 10));
  const perSession = Math.max(1, Math.min(input.per_session_chunks ?? 2, 5));

  const terms = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const files = findSessionFiles(geminiBase(opts));
  const out: ChunkResult[] = [];

  for (const { filePath, hash } of files) {
    if (out.length >= limit) break;
    if (input.directory_glob && !matchesDirectory(geminiBase(opts), hash, input.directory_glob)) {
      continue;
    }

    const parsed = await loadParsedChat(filePath, { cacheWrite: false });
    if (!parsed) continue;

    const hits: SessionText[] = [];
    for (const t of parsed.texts) {
      if (hits.length >= perSession) break;
      const lower = t.text.toLowerCase();
      if (terms.every((term) => lower.includes(term))) {
        hits.push(t);
      }
    }

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      out.push({
        chunk: {
          type: i === 0 ? 'summary' : 'file',
          content: hit.text.slice(0, 500),
          session_id: parsed.group.session_id,
          session_title: parsed.group.title,
          project: parsed.group.project,
          repo_path: parsed.group.repo_path,
          branch: '',
          agent: 'gemini',
          agent_session_id: parsed.group.session_id,
          timestamp: hit.ts ? new Date(hit.ts).toISOString() : parsed.group.started_at,
        },
        score: 1 / (i + 1),
        memory_id: `${parsed.group.session_id}-${i}`,
        why: `matched in ${hit.role} message of gemini session "${parsed.group.title}"`,
      });
      if (out.length >= limit) break;
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Get a single session
// ---------------------------------------------------------------------------

export interface GeminiSessionDetail extends SessionGroup {
  chunks: Chunk[];
  message_count: number;
}

export async function getGeminiSession(
  sessionId: string,
  opts: GeminiStoreOptions = {}
): Promise<GeminiSessionDetail | null> {
  for (const { filePath } of findSessionFiles(geminiBase(opts))) {
    const parsed = await loadParsedChat(filePath);
    if (parsed?.group.session_id === sessionId) {
      return {
        ...parsed.group,
        chunks: parsed.chunks,
        message_count: parsed.texts.length,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Find related sessions (path signals are weak for gemini; match on files)
// ---------------------------------------------------------------------------

export async function findGeminiRelatedSessions(
  input: { repo_path?: string; files?: string[]; limit?: number },
  opts: GeminiStoreOptions = {}
): Promise<Array<{ group: SessionGroup; score: number; reason: string }>> {
  if (!input.files || input.files.length === 0) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  const out: Array<{ group: SessionGroup; score: number; reason: string }> = [];

  for (const { filePath } of findSessionFiles(geminiBase(opts))) {
    if (out.length >= limit) break;
    const parsed = await loadParsedChat(filePath, { cacheWrite: false });
    if (!parsed) continue;

    const allText = parsed.texts.map((t) => t.text).join(' ').toLowerCase();
    let fileHits = 0;
    for (const f of input.files) {
      const leaf = path.basename(f).toLowerCase();
      if (leaf && allText.includes(leaf)) fileHits++;
    }
    if (fileHits === 0) continue;

    out.push({
      group: parsed.group,
      score: fileHits,
      reason: `${fileHits} file overlap(s)`,
    });
  }

  out.sort((a, b) => b.score - a.score || b.group.started_at.localeCompare(a.group.started_at));
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Status / availability
// ---------------------------------------------------------------------------

export interface GeminiDbStatus {
  ok: boolean;
  path: string | null;
  size_bytes: number | null;
  session_count: number | null;
  error?: string;
}

export function geminiDbStatus(opts: GeminiStoreOptions = {}): GeminiDbStatus {
  const base = geminiBase(opts);
  const tmpDir = path.join(base, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    return {
      ok: false,
      path: null,
      size_bytes: null,
      session_count: null,
      error: `gemini tmp dir not found at ${tmpDir}`,
    };
  }

  const files = findSessionFiles(base);
  let totalBytes = 0;
  for (const { filePath } of files) {
    try {
      totalBytes += fs.statSync(filePath).size;
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    path: tmpDir,
    size_bytes: totalBytes,
    session_count: files.length,
  };
}

// ---------------------------------------------------------------------------
// AgentSessionStore implementation
// ---------------------------------------------------------------------------

export class GeminiSessionStore implements AgentSessionStore {
  readonly name: AgentName = 'gemini';

  private readonly storeOpts: GeminiStoreOptions;

  constructor(opts: GeminiStoreOptions = {}) {
    this.storeOpts = opts;
  }

  private optsFor(_input?: unknown): GeminiStoreOptions {
    return this.storeOpts;
  }

  async available(): Promise<{ ok: boolean; reason?: string; meta?: Record<string, unknown> }> {
    if (process.env.SQUISH_GEMINI_DISABLED === '1') {
      return { ok: false, reason: 'gemini disabled via SQUISH_GEMINI_DISABLED=1' };
    }
    const status = geminiDbStatus(this.storeOpts);
    if (!status.ok) {
      return { ok: false, reason: status.error ?? 'gemini chats not available' };
    }
    return {
      ok: true,
      meta: { path: status.path, session_count: status.session_count },
    };
  }

  async status(): Promise<{ path: string; size: number; sessions: number; messages: number; parts: number } | null> {
    const s = geminiDbStatus(this.storeOpts);
    if (!s.ok || !s.path || s.size_bytes == null) return null;
    return {
      path: s.path,
      size: s.size_bytes,
      sessions: s.session_count ?? 0,
      messages: 0,
      parts: 0,
    };
  }

  async listSessions(listOpts?: { limit?: number; offset?: number; directory_glob?: string }): Promise<SessionGroup[]> {
    return listGeminiSessions(
      {
        limit: listOpts?.limit,
        offset: listOpts?.offset,
        directory_glob: listOpts?.directory_glob,
      },
      this.optsFor(listOpts)
    );
  }

  async searchSessions(input: { query: string; limit?: number; depth?: 'text' | 'deep'; directory_glob?: string; per_session_chunks?: number }): Promise<Chunk[]> {
    const results = await searchGeminiSessions(
      {
        query: input.query,
        limit: input.limit,
        depth: input.depth,
        directory_glob: input.directory_glob,
        per_session_chunks: input.per_session_chunks,
      },
      this.optsFor(input)
    );
    return results.map((r) => r.chunk);
  }

  async getSession(id: string): Promise<{ group: SessionGroup; chunks: Chunk[] } | null> {
    const detail = await getGeminiSession(id, this.optsFor({}));
    if (!detail) return null;
    const group: SessionGroup = {
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
    };
    return { group, chunks: detail.chunks };
  }

  async findRelatedSessions(input: { repo_path?: string; files?: string[]; limit?: number }): Promise<Array<{ group: SessionGroup; score: number; reason: string }>> {
    return findGeminiRelatedSessions(
      { repo_path: input.repo_path, files: input.files, limit: input.limit },
      this.optsFor({})
    );
  }
}
