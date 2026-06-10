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
    content?: string | Array<{ type: string; text?: string }>;
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
 * Content can be a string or an array of content blocks.
 */
function extractText(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  // Array of content blocks — extract text blocks
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      texts.push(block.text);
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

export function searchClaudeCodeSessions(
  input: SearchClaudeCodeInput,
  opts: ClaudeCodeStoreOptions = {}
): ChunkResult[] {
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

    const filePath = findSessionFile(claudeBase(opts), entry.sessionId, entry.project);
    if (!filePath) continue;

    const messages = readSessionMessages(filePath);
    const group = historyEntryToGroup(entry, undefined, messages.length);

    // Collect hits from this session
    const sessionHits: Array<{ msg: RawMessage; text: string; matchIdx: number }> = [];

    for (const msg of messages) {
      if (sessionHits.length >= perSession) break;

      // Only search user and assistant messages by default
      if (input.depth !== 'deep') {
        if (msg.type !== 'user' && msg.type !== 'assistant') continue;
      }

      const text = cleanText(extractText(msg.message?.content));
      if (text.length === 0) continue;

      const lowerText = text.toLowerCase();
      const allMatch = terms.every((term) => lowerText.includes(term));
      if (!allMatch) continue;

      sessionHits.push({ msg, text, matchIdx: 0 });
    }

    // Build chunks from hits
    for (let i = 0; i < sessionHits.length; i++) {
      const hit = sessionHits[i];
      const content = hit.text.slice(0, 500);
      if (content.length === 0) continue;

      const role = hit.msg.message?.role ?? hit.msg.type;
      const memoryId = hit.msg.uuid ?? `${entry.sessionId}-${i}`;
      const msgTs = hit.msg.timestamp ?? entry.timestamp;

      out.push({
        chunk: {
          type: i === 0 ? 'summary' : 'file',
          content,
          session_id: entry.sessionId,
          session_title: group.title,
          project: group.project,
          repo_path: group.repo_path,
          branch: hit.msg.gitBranch ?? '',
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

export function getClaudeCodeSession(
  sessionId: string,
  opts: ClaudeCodeStoreOptions = {}
): ClaudeCodeSessionDetail | null {
  const entries = readHistoryIndex(claudeBase(opts));
  const entry = entries.find((e) => e.sessionId === sessionId);
  if (!entry) return null;

  const filePath = findSessionFile(claudeBase(opts), sessionId, entry.project);
  const messages = filePath ? readSessionMessages(filePath) : [];

  const group = historyEntryToGroup(entry, undefined, messages.length);

  const chunks: Chunk[] = [];

  // Build a summary chunk from the first user message
  const firstUser = messages.find((m) => m.type === 'user' && m.message?.content);
  if (firstUser) {
    const text = cleanText(extractText(firstUser.message?.content)).slice(0, 500);
    if (text) {
      chunks.push({
        type: 'summary',
        content: text,
        session_id: sessionId,
        session_title: group.title,
        project: group.project,
        repo_path: group.repo_path,
        branch: firstUser.gitBranch ?? '',
        agent: 'claude-code',
        agent_session_id: sessionId,
        timestamp: epochToIso(firstUser.timestamp ?? entry.timestamp),
      });
    }
  }

  // Build chunks from assistant messages (first few)
  const assistantMsgs = messages.filter((m) => m.type === 'assistant' && m.message?.content);
  let assistantChunks = 0;
  const maxAssistantChunks = 5;
  for (const msg of assistantMsgs) {
    if (assistantChunks >= maxAssistantChunks) break;
    const text = cleanText(extractText(msg.message?.content)).slice(0, 500);
    if (!text) continue;
    chunks.push({
      type: 'file',
      content: text,
      session_id: sessionId,
      session_title: group.title,
      project: group.project,
      repo_path: group.repo_path,
      branch: msg.gitBranch ?? '',
      agent: 'claude-code',
      agent_session_id: sessionId,
      timestamp: epochToIso(msg.timestamp ?? entry.timestamp),
    });
    assistantChunks++;
  }

  return {
    ...group,
    chunks,
    message_count: messages.length,
  };
}

// ---------------------------------------------------------------------------
// Find related sessions (by path/file keyword overlap)
// ---------------------------------------------------------------------------

export function findClaudeCodeRelatedSessions(
  input: { repo_path?: string; files?: string[]; limit?: number },
  opts: ClaudeCodeStoreOptions = {}
): Array<{ group: SessionGroup; score: number; reason: string }> {
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
      const filePath = findSessionFile(claudeBase(opts), entry.sessionId, entry.project);
      if (filePath) {
        const messages = readSessionMessages(filePath);
        const allText = messages
          .map((m) => cleanText(extractText(m.message?.content)))
          .join(' ')
          .toLowerCase();
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

  private optsFor(_input?: { directory_glob?: string }): ClaudeCodeStoreOptions {
    return {};
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
    const results = searchClaudeCodeSessions(
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
    const detail = getClaudeCodeSession(id, this.optsFor({}));
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
    return findClaudeCodeRelatedSessions(
      { repo_path: input.repo_path, files: input.files, limit: input.limit },
      this.optsFor({})
    );
  }
}
