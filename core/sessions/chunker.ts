/**
 * Pure chunk extractors. No IO. Take raw OpenCode SDK output and
 * produce Chunk[]. Each extractor corresponds to one ChunkType:
 *   - summary  -> first user message
 *   - decision -> assistant messages with decision language
 *   - command  -> bash tool invocations
 *   - file     -> file edits
 *   - error    -> error events
 *   - todo     -> todo updates
 *
 * All extractors:
 *   - skip empty content
 *   - truncate chunk.content to MAX_CONTENT_CHARS
 *   - fall back to "now" if no timestamp given
 *   - return chunks in chronological order
 */

import type { AgentId, Chunk, ChunkType, SessionStatus } from './types.js';

const MAX_CONTENT_CHARS = 500;
const DECISION_CAP = 5;
const COMMAND_CAP = 10;
const FILE_CAP = 20;
const ERROR_CAP = 10;
const TODO_CAP = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function pickTimestamp(explicit: string | undefined): string {
  if (explicit && explicit.trim().length > 0) return explicit;
  return nowIso();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

function cleanContent(raw: string | undefined | null): string {
  if (raw == null) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function isEmpty(s: string): boolean {
  return s.length === 0;
}

function sortByTimestamp(chunks: Chunk[]): Chunk[] {
  return chunks
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

interface CommonContext {
  session_id: string;
  title: string;
  project: string;
  repo_path: string;
  branch: string;
  agent: AgentId;
  agent_session_id: string;
}

function buildChunk(
  type: ChunkType,
  ctx: CommonContext,
  content: string,
  timestamp: string,
  files?: string[]
): Chunk {
  const chunk: Chunk = {
    type,
    content: truncate(cleanContent(content), MAX_CONTENT_CHARS),
    session_id: ctx.session_id,
    session_title: ctx.title,
    project: ctx.project,
    repo_path: ctx.repo_path,
    branch: ctx.branch,
    agent: ctx.agent,
    agent_session_id: ctx.agent_session_id,
    timestamp: pickTimestamp(timestamp),
  };
  if (files && files.length > 0) {
    chunk.files = files.slice();
  }
  return chunk;
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export interface SummaryInput extends CommonContext {
  firstUserMessage: string;
  timestamp?: string;
}

export function makeSummaryChunk(input: SummaryInput): Chunk {
  return buildChunk(
    'summary',
    {
      session_id: input.session_id,
      title: input.title,
      project: input.project,
      repo_path: input.repo_path,
      branch: input.branch,
      agent: input.agent,
      agent_session_id: input.agent_session_id,
    },
    input.firstUserMessage,
    input.timestamp ?? nowIso()
  );
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

const DECISION_PREFIXES = [
  /^decision\s*:/i,
  /^let'?s\b/i,
  /^i'?ll\b/i,
  /^we\s+will\b/i,
  /^going\s+with\b/i,
];

const DECISION_INLINE = /\b(decided|chose|picked|going with)\b/i;

export interface MessageLike {
  role: string;
  content: string;
  timestamp?: string;
}

export interface DecisionInput extends CommonContext {
  messages: MessageLike[];
}

export function extractDecisionChunks(input: DecisionInput): Chunk[] {
  const out: Chunk[] = [];
  const ctx: CommonContext = {
    session_id: input.session_id,
    title: input.title,
    project: input.project,
    repo_path: input.repo_path,
    branch: input.branch,
    agent: input.agent,
    agent_session_id: input.agent_session_id,
  };
  for (const msg of input.messages) {
    if (out.length >= DECISION_CAP) break;
    if (msg.role !== 'assistant') continue;
    const text = cleanContent(msg.content);
    if (isEmpty(text)) continue;
    const matchedPrefix = DECISION_PREFIXES.some((re) => re.test(text));
    const matchedInline = DECISION_INLINE.test(text);
    if (!matchedPrefix && !matchedInline) continue;
    out.push(buildChunk('decision', ctx, text, msg.timestamp ?? nowIso()));
  }
  return sortByTimestamp(out);
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

export interface BashInvocation {
  command: string;
  timestamp?: string;
  cwd?: string;
}

export interface CommandInput extends CommonContext {
  bashInvocations: BashInvocation[];
}

export function extractCommandChunks(input: CommandInput): Chunk[] {
  const out: Chunk[] = [];
  const ctx: CommonContext = {
    session_id: input.session_id,
    title: input.title,
    project: input.project,
    repo_path: input.repo_path,
    branch: input.branch,
    agent: input.agent,
    agent_session_id: input.agent_session_id,
  };
  for (const inv of input.bashInvocations) {
    if (out.length >= COMMAND_CAP) break;
    const cmd = cleanContent(inv.command);
    if (isEmpty(cmd)) continue;
    const files = inv.cwd ? [inv.cwd] : undefined;
    out.push(buildChunk('command', ctx, cmd, inv.timestamp ?? nowIso(), files));
  }
  return sortByTimestamp(out);
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export interface FileEdit {
  path: string;
  timestamp?: string;
  summary?: string;
}

export interface FileInput extends CommonContext {
  fileEdits: FileEdit[];
}

export function extractFileChunks(input: FileInput): Chunk[] {
  const out: Chunk[] = [];
  const ctx: CommonContext = {
    session_id: input.session_id,
    title: input.title,
    project: input.project,
    repo_path: input.repo_path,
    branch: input.branch,
    agent: input.agent,
    agent_session_id: input.agent_session_id,
  };
  for (const edit of input.fileEdits) {
    if (out.length >= FILE_CAP) break;
    const p = cleanContent(edit.path);
    if (isEmpty(p)) continue;
    const summary = cleanContent(edit.summary);
    const content = summary && summary !== p ? `${p} \u2014 ${summary}` : p;
    out.push(buildChunk('file', ctx, content, edit.timestamp ?? nowIso(), [p]));
  }
  return sortByTimestamp(out);
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ErrorEvent {
  message: string;
  timestamp?: string;
  stack?: string;
}

export interface ErrorInput extends CommonContext {
  errors: ErrorEvent[];
}

export function extractErrorChunks(input: ErrorInput): Chunk[] {
  const out: Chunk[] = [];
  const ctx: CommonContext = {
    session_id: input.session_id,
    title: input.title,
    project: input.project,
    repo_path: input.repo_path,
    branch: input.branch,
    agent: input.agent,
    agent_session_id: input.agent_session_id,
  };
  for (const ev of input.errors) {
    if (out.length >= ERROR_CAP) break;
    const msg = cleanContent(ev.message);
    if (isEmpty(msg)) continue;
    out.push(buildChunk('error', ctx, msg, ev.timestamp ?? nowIso()));
  }
  return sortByTimestamp(out);
}

/* ------------------------------------------------------------------ */
/* Todos                                                               */
/* ------------------------------------------------------------------ */

export interface TodoEntry {
  content: string;
  status: string;
  timestamp?: string;
}

export interface TodoInput extends CommonContext {
  todos: TodoEntry[];
}

export function extractTodoChunks(input: TodoInput): Chunk[] {
  const out: Chunk[] = [];
  const ctx: CommonContext = {
    session_id: input.session_id,
    title: input.title,
    project: input.project,
    repo_path: input.repo_path,
    branch: input.branch,
    agent: input.agent,
    agent_session_id: input.agent_session_id,
  };
  for (const t of input.todos) {
    if (out.length >= TODO_CAP) break;
    const text = cleanContent(t.content);
    if (isEmpty(text)) continue;
    const status = cleanContent(t.status);
    const content = status ? `[${status}] ${text}` : text;
    out.push(buildChunk('todo', ctx, content, t.timestamp ?? nowIso()));
  }
  return sortByTimestamp(out);
}
