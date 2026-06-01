/**
 * Sessions Command - search / list / load / capture past AI coding sessions.
 *
 * The CLI is for HUMANS. The plugin uses its own LLM-invokable tools.
 * Search returns CHUNKS (3-10 matching pieces) not whole sessions.
 *
 * Two backends, transparent to the user:
 *   1. Squish memory (manually-captured chunks via `sessions capture` or
 *      the OpenCode plugin's auto-capture hooks).
 *   2. The user's local opencode.db (~/.local/share/opencode/opencode.db),
 *      which contains the full history of every OpenCode session ever run.
 *      This is the "pull from opencode into context" direction.
 *
 * Default source is `all` (both backends merged, deduped by session_id).
 *
 * Subcommands:
 *   squish sessions list [--limit N] [--project PATH] [--directory PATH]
 *                        [--source squish|opencode|all] [--db-path PATH]
 *                        [--json|--pretty]
 *   squish sessions show <id> [--source ...] [--db-path PATH] [--json|--pretty]
 *   squish sessions search <query> [--chunk-type type] [--project PATH]
 *                              [--directory PATH] [--source ...] [--db-path PATH]
 *                              [--limit N] [--depth text|deep]
 *                              [--json|--pretty]
 *   squish sessions capture <summary> [--id ID] [--title TITLE] [--project PATH]
 *                                  [--agent A] [--agent-session-id SID] [--json]
 *   squish sessions related [--file path1,path2] [--repo-path PATH] [--limit N]
 *                           [--source ...] [--db-path PATH] [--json|--pretty]
 *   squish sessions inject <id> [--source ...] [--db-path PATH] [--json]
 *   squish sessions status [--json|--pretty]
 *
 * All commands default to --json output. Pass --pretty for human-readable.
 */

import { randomUUID } from 'node:crypto';
import { Command } from 'commander';

import {
  buildInjectText,
  captureChunk,
  findRelatedSessions,
  formatChunkResults,
  formatSessionDetail,
  formatSessionList,
  getSessionChunks,
  getOpenCodeStatus,
  listSessions,
  listSessionGroups,
  makeSummaryChunk,
  searchChunks,
  type AgentId,
  type Chunk,
  type SessionGroup,
  type SessionSource,
} from '../../../../core/sessions/index.js';

function parseCsv(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseSource(input: string | undefined): SessionSource {
  if (input === 'squish' || input === 'opencode' || input === 'all') return input;
  return 'all';
}

function outputJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

function outputPretty(text: string): void {
  process.stdout.write(text + '\n');
}

function fail(message: string, extra: Record<string, unknown> = {}): never {
  process.stderr.write(JSON.stringify({ ok: false, error: message, ...extra }) + '\n');
  process.exit(1);
}

function asAgent(v: string | undefined, fallback: AgentId = 'cli'): AgentId {
  const allowed: AgentId[] = ['opencode', 'claude-code', 'openclaw', 'codex', 'cli', 'manual'];
  if (!v) return fallback;
  return allowed.includes(v as AgentId) ? (v as AgentId) : fallback;
}

/* ------------------------------------------------------------------ */
/* Subcommand implementations                                         */
/* ------------------------------------------------------------------ */

interface CommonOpts {
  source?: string;
  dbPath?: string;
  json?: boolean;
  pretty?: boolean;
}

async function runList(opts: {
  limit?: string;
  project?: string;
  directory?: string;
  source?: string;
  dbPath?: string;
  json?: boolean;
  pretty?: boolean;
}): Promise<void> {
  const limit = opts.limit ? parseInt(opts.limit, 10) || 20 : 20;
  const source = parseSource(opts.source);
  const result = await listSessions({
    limit,
    project: opts.project,
    source,
    opencode_db_path: opts.dbPath,
    directory_glob: opts.directory,
  });

  if (opts.pretty) {
    outputPretty(formatSessionList(result.sessions));
    if (result.sources.opencode > 0) {
      const oc = result.opencode;
      if (oc.ok) {
        process.stdout.write(
          `\n(${result.sources.squish} squish, ${result.sources.opencode} opencode (from ${oc.session_count} total in ${oc.path}))\n`
        );
      } else {
        process.stdout.write(
          `\n(${result.sources.squish} squish; opencode: ${oc.error ?? 'not found'})\n`
        );
      }
    } else {
      process.stdout.write(`\n(${result.sources.squish} squish)\n`);
    }
    return;
  }
  outputJson({ ok: true, count: result.sessions.length, ...result });
}

async function runShow(
  id: string,
  opts: { source?: string; dbPath?: string; json?: boolean; pretty?: boolean }
): Promise<void> {
  const source = parseSource(opts.source);
  const session = await getSessionChunks(id, { source, opencode_db_path: opts.dbPath });
  if (!session) fail(`Session not found: ${id}`);
  if (opts.pretty) {
    outputPretty(formatSessionDetail(session));
    return;
  }
  outputJson({ ok: true, session });
}

async function runSearch(
  query: string,
  opts: {
    chunkType?: string;
    project?: string;
    directory?: string;
    source?: string;
    dbPath?: string;
    depth?: string;
    limit?: string;
    json?: boolean;
    pretty?: boolean;
  }
): Promise<void> {
  const limit = opts.limit ? parseInt(opts.limit, 10) || 8 : 8;
  const source = parseSource(opts.source);
  const depth = opts.depth === 'deep' ? 'deep' : 'text';
  const chunk_type = (opts.chunkType ?? undefined) as Chunk['type'] | undefined;
  const results = await searchChunks({
    query,
    limit,
    project: opts.project,
    repo_path: opts.directory,
    chunk_type,
    source,
    opencode_db_path: opts.dbPath,
  });

  if (opts.pretty) {
    outputPretty(formatChunkResults(results));
    return;
  }
  outputJson({
    ok: true,
    count: results.length,
    source,
    results: results.map((r) => ({
      score: r.score,
      memory_id: r.memory_id,
      why: r.why,
      chunk: r.chunk,
    })),
  });
}

async function runCapture(
  summary: string,
  opts: {
    id?: string;
    title?: string;
    project?: string;
    repoPath?: string;
    branch?: string;
    agent?: string;
    agentSessionId?: string;
    json?: boolean;
  }
): Promise<void> {
  const sessionId = opts.id ?? randomUUID();
  const project = opts.project ?? process.cwd();
  const title = opts.title ?? summary.split('\n')[0].slice(0, 80);
  const agent = asAgent(opts.agent);
  const agentSessionId = opts.agentSessionId ?? `cli-${Date.now()}`;

  const chunk: Chunk = makeSummaryChunk({
    session_id: sessionId,
    title,
    firstUserMessage: summary,
    project,
    repo_path: opts.repoPath ?? project,
    branch: opts.branch ?? '',
    agent,
    agent_session_id: agentSessionId,
    timestamp: new Date().toISOString(),
  });
  const memoryId = await captureChunk(chunk, { project });

  outputJson({ ok: true, id: sessionId, memory_id: memoryId, chunk });
}

async function runRelated(opts: {
  file?: string;
  repoPath?: string;
  source?: string;
  dbPath?: string;
  limit?: string;
  json?: boolean;
  pretty?: boolean;
}): Promise<void> {
  const files = parseCsv(opts.file);
  const repoPath = opts.repoPath ?? process.cwd();
  const source = parseSource(opts.source);
  const limit = opts.limit ? parseInt(opts.limit, 10) || 5 : 5;
  const results = await findRelatedSessions({
    repo_path: repoPath,
    files,
    limit,
    source,
    opencode_db_path: opts.dbPath,
  });

  if (opts.pretty) {
    const sessions: SessionGroup[] = results.map((r) => r.session);
    outputPretty(formatSessionList(sessions));
    return;
  }
  outputJson({
    ok: true,
    count: results.length,
    results: results.map((r) => ({
      score: r.score,
      session: r.session,
      matching_chunks: r.matching_chunks,
    })),
  });
}

async function runInject(
  id: string,
  opts: { source?: string; dbPath?: string; json?: boolean }
): Promise<void> {
  const source = parseSource(opts.source);
  const inject_text = await buildInjectText(id, { source, opencode_db_path: opts.dbPath });
  if (!inject_text) fail(`Session not found: ${id}`);
  outputJson({ ok: true, id, inject_text });
}

async function runStatus(opts: { dbPath?: string; json?: boolean; pretty?: boolean }): Promise<void> {
  const status = getOpenCodeStatus({ db_path: opts.dbPath });
  if (opts.pretty) {
    if (!status.ok) {
      outputPretty(`opencode.db: not available (${status.error ?? 'unknown'})`);
      return;
    }
    const mb = status.size_bytes ? (status.size_bytes / 1_000_000).toFixed(1) + ' MB' : '?';
    outputPretty(
      [
        `opencode.db: ${status.path}`,
        `  size:        ${mb}`,
        `  sessions:    ${status.session_count ?? 0}`,
        `  messages:    ${status.message_count ?? 0}`,
        `  parts:       ${status.part_count ?? 0}`,
      ].join('\n')
    );
    return;
  }
  outputJson({ ok: status.ok, ...status });
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerSessionsCommand(program: Command): void {
  const sessions = program
    .command('sessions')
    .description('Search, list, load, and capture past AI coding sessions (squish + opencode.db)');

  sessions
    .command('list')
    .description('List captured sessions (default: merged squish + opencode.db)')
    .option('-l, --limit <n>', 'Max results', '20')
    .option('-p, --project <path>', 'Filter squish results by project')
    .option('-d, --directory <path>', 'Filter opencode results by directory substring')
    .option('-s, --source <src>', 'squish | opencode | all (default: all)', 'all')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('--json', 'Emit JSON (default)', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (opts: any) => {
      try {
        await runList(opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('show <id>')
    .description('Show all chunks for a session (squish or opencode)')
    .option('-s, --source <src>', 'squish | opencode | all (default: all)', 'all')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('--json', 'Emit JSON (default)', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (id: string, opts: any) => {
      try {
        await runShow(id, opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('search <query>')
    .description('Search chunks (returns 3-10 matching pieces, not whole sessions)')
    .option('--chunk-type <type>', 'summary|decision|command|file|error|todo')
    .option('-p, --project <path>', 'Restrict squish results to one project')
    .option('-d, --directory <path>', 'Restrict opencode results to one directory')
    .option('-s, --source <src>', 'squish | opencode | all (default: all)', 'all')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('--depth <depth>', 'text (fast) | deep (all parts, slower)', 'text')
    .option('-l, --limit <n>', 'Max results (default 8, max 10)', '8')
    .option('--json', 'Emit JSON (default)', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (query: string, opts: any) => {
      try {
        await runSearch(query, opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('capture <summary>')
    .description('Capture a session summary chunk (creates or uses --id)')
    .option('--id <id>', 'Session id (generates one if not provided)')
    .option('--title <title>', 'Human-readable title')
    .option('-p, --project <name>', 'Project name')
    .option('--repo-path <path>', 'Absolute path to repo root')
    .option('--branch <branch>', 'Git branch at capture time')
    .option('--agent <agent>', 'opencode|claude-code|openclaw|codex|cli|manual', 'cli')
    .option('--agent-session-id <sid>', 'Source agent session id')
    .option('--json', 'Emit JSON (default)', false)
    .action(async (summary: string, opts: any) => {
      try {
        await runCapture(summary, opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('related')
    .description('Find past sessions related to a repo and files (squish + opencode)')
    .option('--file <paths>', 'Comma-separated files of interest')
    .option('--repo-path <path>', 'Absolute repo path (default: cwd)')
    .option('-s, --source <src>', 'squish | opencode | all (default: all)', 'all')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('-l, --limit <n>', 'Max results (default 5)', '5')
    .option('--json', 'Emit JSON (default)', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (opts: any) => {
      try {
        await runRelated(opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('inject <id>')
    .description('Build a markdown block to inject as context')
    .option('-s, --source <src>', 'squish | opencode | all (default: all)', 'all')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('--json', 'Emit JSON (default)', false)
    .action(async (id: string, opts: any) => {
      try {
        await runInject(id, opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });

  sessions
    .command('status')
    .description('Show opencode.db connection status (path, size, session/message/part counts)')
    .option('--db-path <path>', 'Override opencode.db path')
    .option('--json', 'Emit JSON (default)', false)
    .option('--pretty', 'Human-readable output', false)
    .action(async (opts: any) => {
      try {
        await runStatus(opts);
      } catch (err: any) {
        fail(err?.message ?? String(err));
      }
    });
}
