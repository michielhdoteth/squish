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

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { logger } from '../../logger.js';
import type { Chunk, ChunkResult, SessionGroup } from '../types.js';
import type { AgentSessionStore, AgentName } from './types.js';
import { readSessionCache, statSessionFile, writeSessionCache } from './cache.js';
import { recordParsedSessionSignals } from '../../session/working-set.js';

// ---------------------------------------------------------------------------
// Path discovery
// ---------------------------------------------------------------------------

/**
 * Default location of the Claude Code data directory.
 * `~/.claude/` on all platforms including Windows.
 */
export function defaultClaudeDir(): string {
  if (process.env.SQUISH_CLAUDE_DISABLED === '1') {
    return path.join(os.homedir(), '.squish', 'claude-disabled-for-tests');
  }
  return path.join(os.homedir(), '.claude');
}

export interface ClaudeCodeStoreOptions {
  /** Override the base directory (default: defaultClaudeDir()) */
  claudeDir?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function epochToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Compute the project-hash directory name used in `~/.claude/projects/`.
 * Claude Code replaces `:` and `\` with `-` in the absolute path.
 */
function projectHash(projectPath: string): string {
  return projectPath.replace(/:/g, '-').replace(/\\/g, '-');
}

/**
 * Extract the leaf project name from a path (e.g. `C:\Users\user\projects\foo` -> `foo`).
 */
function deriveProjectName(projectPath: string): string {
  if (!projectPath) return '';
  const norm = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm === '/' || /^[A-Z]:$/.test(norm)) return projectPath;
  const parts = norm.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

/**
 * Trim and collapse whitespace in a string for chunk content.
 */
function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// History.jsonl parsing (session index)
// ---------------------------------------------------------------------------

interface HistoryEntry {
  display: string;
  pastedContents?: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

/**
 * Read and parse `~/.claude/history.jsonl`. Returns all history entries
 * sorted by timestamp descending (newest first).
 */
function readHistoryIndex(claudeDir: string): HistoryEntry[] {
  const historyPath = path.join(claudeDir, 'history.jsonl');
  if (!fs.existsSync(historyPath)) return [];

  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const entries: HistoryEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as HistoryEntry;
        if (parsed.sessionId && parsed.timestamp) {
          entries.push(parsed);
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }
    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  } catch (err) {
    logger.debug(`[claude-code-store] failed to read history.jsonl: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session message parsing
// ---------------------------------------------------------------------------

interface RawMessage {
  type: 'user' | 'assistant' | 'mode' | 'permission-mode' | 'file-history-snapshot' | 'attachment' | 'ai-title' | 'last-prompt' | 'system' | 'queue-operation' | string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    model?: string;
    stop_reason?: string;
  };
  uuid?: string;
  timestamp?: number;
  cwd?: string;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
}

/**
 * Locate the JSONL file for a specific session.
 * Looks in `~/.claude/projects/<hash>/<sessionId>.jsonl`.
 */
function findSessionFile(claudeDir: string, sessionId: string, projectPath?: string): string | null {
  const projectsDir = path.join(claudeDir, 'projects');
  if (!fs.existsSync(projectsDir)) return null;

  // If we know the project path, check that specific directory first
  if (projectPath) {
    const hash = projectHash(projectPath);
    const candidate = path.join(projectsDir, hash, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fall back to searching all project directories
  try {
    const dirs = fs.readdirSync(projectsDir);
    for (const dir of dirs) {
      const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (err) {
    logger.debug(`[claude-code-store] error searching projects dir: ${err}`);
  }

  return null;
}

/**
 * Read all messages from a session JSONL file.
 */
function readSessionMessages(filePath: string): RawMessage[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const messages: RawMessage[] = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as RawMessage);
      } catch {
        // Skip malformed lines
        continue;
      }
    }
    return messages;
  } catch (err) {
    logger.debug(`[claude-code-store] failed to read session file ${filePath}: ${err}`);
    return [];
  }
}

/**
 * Extract plain text content from a message's content field.
 * Content can be a string or an array of content blocks. Tool-use blocks
 * are summarized conservatively (name + one-line target) and huge tool
 * payloads are skipped.
 */
function extractText(content: string | Array<{ type: string; text?: string; name?: string; input?: unknown }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  // Array of content blocks — extract text blocks, summarize tool_use
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      texts.push(block.text);
    } else if (block.type === 'tool_use' && block.name) {
      const input = block.input as Record<string, unknown> | undefined;
      const target =
        input?.filePath ?? input?.path ?? input?.command ?? input?.description ?? '';
      texts.push(
        `[tool:${block.name}] ${String(target).slice(0, 120)}`
      );
    }
  }
  return texts.join('\n');
}

/**
 * Build a SessionGroup from a history entry.
 */
function historyEntryToGroup(
  entry: HistoryEntry,
  firstUserMessage?: string,
  messageCount?: number
): SessionGroup {
  const project = deriveProjectName(entry.project);
  const started = epochToIso(entry.timestamp);
  return {
    session_id: entry.sessionId,
    title: entry.display || firstUserMessage || entry.sessionId,
    project,
    repo_path: entry.project,
    branch: '',
    agent: 'claude-code',
    started_at: started,
    ended_at: null,
    status: 'completed',
    chunk_count: messageCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function claudeBase(opts: ClaudeCodeStoreOptions = {}): string {
  return opts.claudeDir ?? defaultClaudeDir();
}

function historyPath(opts: ClaudeCodeStoreOptions = {}): string {
  return path.join(claudeBase(opts), 'history.jsonl');
}

// ---------------------------------------------------------------------------
// Status / availability
// ---------------------------------------------------------------------------

export interface ClaudeCodeDbStatus {
  ok: boolean;
  path: string | null;
  size_bytes: number | null;
  session_count: number | null;
  message_count: number | null;
  part_count: number | null;
  error?: string;
}

export function claudeCodeDbStatus(opts: ClaudeCodeStoreOptions = {}): ClaudeCodeDbStatus {
  const hp = historyPath(opts);
  if (!fs.existsSync(hp)) {
    return {
      ok: false,
      path: null,
      size_bytes: null,
      session_count: null,
      message_count: null,
      part_count: null,
      error: `history.jsonl not found at ${hp}`,
    };
  }

  const stat = fs.statSync(hp);
  const entries = readHistoryIndex(claudeBase(opts));

  return {
    ok: true,
    path: hp,
    size_bytes: stat.size,
    session_count: entries.length,
    // We don't eagerly count all messages; 0 is a safe placeholder
    message_count: null,
    part_count: null,
  };
}

// ---------------------------------------------------------------------------
// List sessions
// ---------------------------------------------------------------------------

export interface ListClaudeCodeSessionsInput {
  limit?: number;
  offset?: number;
  directory_glob?: string;
}

export function listClaudeCodeSessions(
  input: ListClaudeCodeSessionsInput = {},
  opts: ClaudeCodeStoreOptions = {}
): SessionGroup[] {
  const entries = readHistoryIndex(claudeBase(opts));
  if (entries.length === 0) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 20, 200));
  const offset = Math.max(0, input.offset ?? 0);

  // Deduplicate by sessionId (keep first / most recent entry)
  const seen = new Set<string>();
  const unique: HistoryEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.sessionId)) {
      seen.add(e.sessionId);
      unique.push(e);
    }
  }

  // Filter by directory if requested
  let filtered = unique;
  if (input.directory_glob) {
    const glob = input.directory_glob.toLowerCase();
    filtered = unique.filter((e) => e.project && e.project.toLowerCase().includes(glob));
  }

  // Apply offset + limit
  const sliced = filtered.slice(offset, offset + limit);
  return sliced.map((e) => historyEntryToGroup(e));
}

// ---------------------------------------------------------------------------
// Search sessions (text search in JSONL message content)
// ---------------------------------------------------------------------------

export interface SearchClaudeCodeInput {
  query: string;
  limit?: number;
  depth?: 'text' | 'deep';
  directory_glob?: string;
  per_session_chunks?: number;
}

export async function searchClaudeCodeSessions(
  input: SearchClaudeCodeInput,
  opts: ClaudeCodeStoreOptions = {}
): Promise<ChunkResult[]> {
  if (!input.query || input.query.trim().length === 0) return [];

  const entries = readHistoryIndex(claudeBase(opts));
  if (entries.length === 0) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 8, 10));
  const perSession = Math.max(1, Math.min(input.per_session_chunks ?? 2, 5));

  // Split query into terms; require ALL terms (AND)
  const terms = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  // Deduplicate entries by sessionId
  const seen = new Set<string>();
  const unique: HistoryEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.sessionId)) {
      seen.add(e.sessionId);
      unique.push(e);
    }
  }

  // Filter by directory if requested
  let candidates = unique;
  if (input.directory_glob) {
    const glob = input.directory_glob.toLowerCase();
    candidates = unique.filter((e) => e.project && e.project.toLowerCase().includes(glob));
  }

  const out: ChunkResult[] = [];

  for (const entry of candidates) {
    if (out.length >= limit) break;

    // Bulk scan path: read through the parse cache but never write back.
    const parsed = await loadParsedSession(claudeBase(opts), entry.sessionId, entry, { cacheWrite: false });
    if (!parsed) continue;

    const group = parsed.group;

    // Collect hits from this session's normalized texts
    const sessionHits: Array<{ text: SessionText; matchIdx: number }> = [];

    for (const text of parsed.texts) {
      if (sessionHits.length >= perSession) break;

      const lowerText = text.text.toLowerCase();
      const allMatch = terms.every((term) => lowerText.includes(term));
      if (!allMatch) continue;

      sessionHits.push({ text, matchIdx: 0 });
    }

    // Build chunks from hits
    for (let i = 0; i < sessionHits.length; i++) {
      const hit = sessionHits[i];
      const content = hit.text.text.slice(0, 500);
      if (content.length === 0) continue;

      const role = hit.text.role;
      const memoryId = hit.text.uuid ?? `${entry.sessionId}-${i}`;
      const msgTs = hit.text.ts || entry.timestamp;

      out.push({
        chunk: {
          type: i === 0 ? 'summary' : 'file',
          content,
          session_id: entry.sessionId,
          session_title: group.title,
          project: group.project,
          repo_path: group.repo_path,
          branch: hit.text.branch ?? '',
          agent: 'claude-code',
          agent_session_id: entry.sessionId,
          timestamp: epochToIso(msgTs),
        },
        score: 1 / (i + 1),
        memory_id: memoryId,
        why: `matched in ${role} message of session "${group.title}"`,
      });

      if (out.length >= limit) break;
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Get a single session (with chunks)
// ---------------------------------------------------------------------------

export interface ClaudeCodeSessionDetail extends SessionGroup {
  chunks: Chunk[];
  message_count: number;
}

export async function getClaudeCodeSession(
  sessionId: string,
  opts: ClaudeCodeStoreOptions = {}
): Promise<ClaudeCodeSessionDetail | null> {
  const entries = readHistoryIndex(claudeBase(opts));
  const entry = entries.find((e) => e.sessionId === sessionId) ?? null;

  // Show/get path: reads through the parse cache and writes on miss.
  const parsed = await loadParsedSession(claudeBase(opts), sessionId, entry);
  if (!parsed) return null;

  return {
    ...parsed.group,
    chunks: parsed.chunks,
    message_count: parsed.texts.length,
  };
}

// ---------------------------------------------------------------------------
// Find related sessions (by path/file keyword overlap)
// ---------------------------------------------------------------------------

export async function findClaudeCodeRelatedSessions(
  input: { repo_path?: string; files?: string[]; limit?: number },
  opts: ClaudeCodeStoreOptions = {}
): Promise<Array<{ group: SessionGroup; score: number; reason: string }>> {
  if (!input.repo_path && (!input.files || input.files.length === 0)) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  const entries = readHistoryIndex(claudeBase(opts));
  if (entries.length === 0) return [];

  // Deduplicate
  const seen = new Set<string>();
  const unique: HistoryEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.sessionId)) {
      seen.add(e.sessionId);
      unique.push(e);
    }
  }

  const out: Array<{ group: SessionGroup; score: number; reason: string }> = [];

  for (const entry of unique) {
    if (out.length >= limit) break;

    let score = 0;
    const reasons: string[] = [];

    // Score by path overlap
    if (input.repo_path) {
      const entryNorm = entry.project.replace(/\\/g, '/').toLowerCase();
      const targetNorm = input.repo_path.replace(/\\/g, '/').toLowerCase();
      if (entryNorm.includes(targetNorm) || targetNorm.includes(entryNorm)) {
        score += 2;
        reasons.push(`directory match (${deriveProjectName(entry.project)})`);
      }
    }

    // Score by file overlap in session messages
    if (input.files && input.files.length > 0) {
      const parsed = await loadParsedSession(claudeBase(opts), entry.sessionId, entry, { cacheWrite: false });
      if (parsed) {
        const allText = parsed.texts.map((t) => t.text).join(' ').toLowerCase();
        let fileHits = 0;
        for (const f of input.files) {
          const leaf = path.basename(f).toLowerCase();
          if (leaf && allText.includes(leaf)) {
            fileHits++;
          }
        }
        if (fileHits > 0) {
          score += fileHits;
          reasons.push(`${fileHits} file overlap(s)`);
        }
      }
    }

    if (score === 0) continue;

    const group = historyEntryToGroup(entry);
    out.push({
      group,
      score,
      reason: reasons.join('; '),
    });
  }

  out.sort((a, b) => b.score - a.score || b.group.started_at.localeCompare(a.group.started_at));
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Cached parse layer (Batch 7)
// ---------------------------------------------------------------------------

/** Normalized message text used for search + chunk building. */
interface SessionText {
  role: string;
  text: string;
  ts: number;
  uuid?: string;
  branch?: string;
}

interface ParsedSession {
  group: SessionGroup;
  chunks: Chunk[];
  texts: SessionText[];
}

const MAX_CACHED_TEXT_CHARS = 24_000;

/**
 * Build the parsed `{ group, chunks, texts }` payload for a session file.
 * Pure parsing — no cache interaction.
 */
function parseSessionFile(
  filePath: string,
  group: SessionGroup
): ParsedSession {
  const messages = readSessionMessages(filePath);
  const texts: SessionText[] = [];

  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue;
    const raw = extractText(msg.message?.content);
    const text = cleanText(raw);
    if (!text) continue;
    texts.push({
      role: msg.message?.role ?? msg.type,
      text,
      ts: msg.timestamp ?? 0,
      uuid: msg.uuid,
      branch: msg.gitBranch,
    });
  }

  const chunks: Chunk[] = [];

  // Summary chunk from the first user message
  const firstUser = texts.find((t) => t.role === 'user');
  if (firstUser) {
    chunks.push({
      type: 'summary',
      content: firstUser.text.slice(0, 500),
      session_id: group.session_id,
      session_title: group.title,
      project: group.project,
      repo_path: group.repo_path,
      branch: firstUser.branch ?? '',
      agent: 'claude-code',
      agent_session_id: group.session_id,
      timestamp: epochToIso(firstUser.ts || Date.parse(group.started_at)),
    });
  }

  // A few assistant chunks
  let assistantChunks = 0;
  for (const t of texts) {
    if (assistantChunks >= 5) break;
    if (t.role !== 'assistant') continue;
    chunks.push({
      type: 'file',
      content: t.text.slice(0, 500),
      session_id: group.session_id,
      session_title: group.title,
      project: group.project,
      repo_path: group.repo_path,
      branch: t.branch ?? '',
      agent: 'claude-code',
      agent_session_id: group.session_id,
      timestamp: epochToIso(t.ts || Date.parse(group.started_at)),
    });
    assistantChunks++;
  }

  return { group, chunks, texts };
}

/**
 * Read a parsed session through the mtime-invalidated cache.
 *
 * - Cache hit: payload served from the squish DB (no file read).
 * - Cache miss: parse the JSONL transcript, write the cache, and (best
 *   effort) record working-set signals from the parse. `cacheWrite`
 *   controls whether a miss writes back — bulk scans (search/related)
 *   read without writing so one sweep cannot bloat the DB.
 */
async function loadParsedSession(
  claudeDir: string,
  sessionId: string,
  entry: HistoryEntry | null,
  opts: { cacheWrite?: boolean } = {}
): Promise<ParsedSession | null> {
  // No history entry and no way to locate the file: unknown session.
  if (!entry) {
    const found = findSessionFile(claudeDir, sessionId);
    if (!found) return null;
  }

  const filePath =
    findSessionFile(claudeDir, sessionId, entry?.project) ?? undefined;

  // Transcript file gone but the history entry survives: keep the old
  // behavior of returning the group with an empty chunk list.
  if (!filePath) {
    const groupOnly = historyEntryToGroup(entry!);
    return { group: groupOnly, chunks: [], texts: [] };
  }

  const stat = statSessionFile(filePath);
  const cached = await readSessionCache('claude-code', sessionId, stat);
  if (cached && Array.isArray((cached as any).texts)) {
    return cached as unknown as ParsedSession;
  }

  let entry_ = entry;
  if (!entry_) {
    // No history entry: synthesize a minimal group from the file itself.
    entry_ = {
      display: '',
      timestamp: stat ? Math.round(stat.mtimeMs) : Date.now(),
      project: path.basename(path.dirname(path.dirname(filePath))),
      sessionId,
    };
  }

  const group = historyEntryToGroup(entry_, undefined, undefined);
  const parsed = parseSessionFile(filePath, group);

  if (opts.cacheWrite !== false && stat) {
    // Truncate cached texts so pathological transcripts stay bounded.
    const boundedTexts: SessionText[] = [];
    let budget = MAX_CACHED_TEXT_CHARS;
    for (const t of parsed.texts) {
      if (budget <= 0) break;
      const text = t.text.length > 2000 ? `${t.text.slice(0, 2000)}…` : t.text;
      budget -= text.length;
      boundedTexts.push({ ...t, text });
    }
    await writeSessionCache('claude-code', sessionId, filePath, stat, {
      group: parsed.group,
      chunks: parsed.chunks,
      texts: boundedTexts,
    } as any);
    void recordParsedSessionSignals({
      sessionId: `claude-code:${sessionId}`,
      projectPath: entry_.project || undefined,
      chunks: parsed.chunks.map((c) => ({ type: c.type, content: c.content })),
    });
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// AgentSessionStore implementation
// ---------------------------------------------------------------------------

/**
 * Claude Code-backed implementation of `AgentSessionStore`.
 *
 * Reads the user's local Claude Code history index and per-session
 * JSONL message files to provide the same session search surface as
 * the OpenCode store.
 */
export class ClaudeCodeSessionStore implements AgentSessionStore {
  readonly name: AgentName = 'claude-code';

  private readonly storeOpts: ClaudeCodeStoreOptions;

  constructor(opts: ClaudeCodeStoreOptions = {}) {
    this.storeOpts = opts;
  }

  private optsFor(_input?: { directory_glob?: string }): ClaudeCodeStoreOptions {
    return this.storeOpts;
  }

  async available(): Promise<{ ok: boolean; reason?: string; meta?: Record<string, unknown> }> {
    if (process.env.SQUISH_CLAUDE_DISABLED === '1') {
      return { ok: false, reason: 'claude-code disabled via SQUISH_CLAUDE_DISABLED=1' };
    }
    const status = claudeCodeDbStatus();
    if (!status.ok) {
      return { ok: false, reason: status.error ?? 'history.jsonl not available' };
    }
    return {
      ok: true,
      meta: {
        path: status.path,
        session_count: status.session_count,
      },
    };
  }

  async status(): Promise<{ path: string; size: number; sessions: number; messages: number; parts: number } | null> {
    const s = claudeCodeDbStatus();
    if (!s.ok || !s.path || s.size_bytes == null) return null;
    return {
      path: s.path,
      size: s.size_bytes,
      sessions: s.session_count ?? 0,
      messages: 0, // Not pre-counted for JSONL format
      parts: 0,
    };
  }

  async listSessions(opts?: { limit?: number; offset?: number; directory_glob?: string }): Promise<SessionGroup[]> {
    return listClaudeCodeSessions(
      { limit: opts?.limit, offset: opts?.offset, directory_glob: opts?.directory_glob },
      this.optsFor(opts)
    );
  }

  async searchSessions(input: { query: string; limit?: number; depth?: 'text' | 'deep'; directory_glob?: string; per_session_chunks?: number }): Promise<Chunk[]> {
    const results = await searchClaudeCodeSessions(
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
    const detail = await getClaudeCodeSession(id, this.optsFor({}));
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
    return await findClaudeCodeRelatedSessions(
      { repo_path: input.repo_path, files: input.files, limit: input.limit },
      this.optsFor({})
    );
  }
}
