import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDbClient } from '../lib/db-client.js';
import { ensureProject, getProjectByPath } from '../projects.js';
import { deserializeMetadata, serializeMetadata } from '../memory/serialization.js';

export interface WorkingSetCommand {
  command: string;
  outcome?: string;
  at: string;
}

export interface SessionWorkingSet {
  activeFiles: string[];
  activePlaces: string[];
  graphEntities: string[];
  recentCommands: WorkingSetCommand[];
  currentHypotheses: string[];
  recentFailures: string[];
  recentAttempts: string[];
  projectPath?: string;
  sessionId: string;
  signalStats: {
    captured: number;
    suppressed: number;
    sessionOnly: number;
    durable: number;
    durableWithRaw: number;
    tokensSaved: number;
    placeRouted: number;
    graphEnriched: number;
  };
  recentEvents: Array<{
    classification: string;
    content: string;
    target?: string;
    hash?: string;
    at: string;
  }>;
}

const EMPTY_WORKING_SET = (sessionId: string, projectPath?: string): SessionWorkingSet => ({
  activeFiles: [],
  activePlaces: [],
  graphEntities: [],
  recentCommands: [],
  currentHypotheses: [],
  recentFailures: [],
  recentAttempts: [],
  projectPath,
  sessionId,
  signalStats: {
    captured: 0,
    suppressed: 0,
    sessionOnly: 0,
    durable: 0,
    durableWithRaw: 0,
    tokensSaved: 0,
    placeRouted: 0,
    graphEnriched: 0,
  },
  recentEvents: [],
});

function dedupe(items: string[], limit: number): string[] {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function normalizeSessionMetadata(metadata: unknown, sessionId: string, projectPath?: string): SessionWorkingSet {
  const parsed = (metadata ?? {}) as Partial<SessionWorkingSet>;
  return {
    ...EMPTY_WORKING_SET(sessionId, projectPath),
    ...parsed,
    activeFiles: parsed.activeFiles ?? [],
    activePlaces: parsed.activePlaces ?? [],
    graphEntities: parsed.graphEntities ?? [],
    recentCommands: parsed.recentCommands ?? [],
    currentHypotheses: parsed.currentHypotheses ?? [],
    recentFailures: parsed.recentFailures ?? [],
    recentAttempts: parsed.recentAttempts ?? [],
    recentEvents: parsed.recentEvents ?? [],
    signalStats: {
      ...EMPTY_WORKING_SET(sessionId, projectPath).signalStats,
      ...(parsed.signalStats ?? {}),
    },
  };
}

async function getOrCreateContextSession(sessionId: string, projectPath: string) {
  const { db, schema, raw } = await getDbClient();
  const project = await ensureProject(projectPath);

  const existing = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.sessionId, sessionId))
    .limit(1);

  if (existing[0]) return { row: existing[0], projectId: project?.id ?? null, db, schema };

  const sqlite = (raw as any).$client;
  const id = randomUUID();
  const metadata = serializeMetadata(EMPTY_WORKING_SET(sessionId, projectPath) as unknown as Record<string, unknown>);
  sqlite.prepare(`
    INSERT INTO context_sessions (
      id, session_id, project_id, metadata, token_budget, tokens_used, core_memory_tokens, loaded_memories_tokens, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 8000, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(id, sessionId, project?.id ?? null, metadata);

  const inserted = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.sessionId, sessionId))
    .limit(1);

  return { row: inserted[0], projectId: project?.id ?? null, db, schema };
}

export async function getSessionWorkingSet(sessionId: string, projectPath?: string): Promise<SessionWorkingSet> {
  const { db, schema } = await getDbClient();
  const rows = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.sessionId, sessionId))
    .limit(1);

  if (!rows[0]) return EMPTY_WORKING_SET(sessionId, projectPath);
  return normalizeSessionMetadata(deserializeMetadata(rows[0].metadata ?? null), sessionId, projectPath);
}

export async function recordSessionSignal(input: {
  sessionId: string;
  projectPath: string;
  classification: 'discard' | 'session-only' | 'durable-distilled' | 'durable-raw+distilled';
  distilledContent: string;
  toolName: string;
  target?: string;
  metadata?: Record<string, unknown>;
}): Promise<SessionWorkingSet> {
  const { row, db, schema } = await getOrCreateContextSession(input.sessionId, input.projectPath);
  const current = normalizeSessionMetadata(deserializeMetadata(row.metadata ?? null), input.sessionId, input.projectPath);
  const meta = input.metadata ?? {};
  const now = new Date().toISOString();

  const next = normalizeSessionMetadata(current, input.sessionId, input.projectPath);
  next.activeFiles = dedupe([
    ...next.activeFiles,
    ...(((meta.activeFiles as string[]) ?? [])),
  ], 8);
  next.activePlaces = dedupe([
    ...next.activePlaces,
    ...(((meta.activePlaces as string[]) ?? [])),
  ], 6);
  next.graphEntities = dedupe([
    ...next.graphEntities,
    ...(((meta.graphEntities as string[]) ?? [])),
  ], 8);

  const command = typeof meta.command === 'string' ? meta.command : undefined;
  if (command) {
    next.recentCommands = [{ command, outcome: typeof meta.outcome === 'string' ? meta.outcome : undefined, at: now }, ...next.recentCommands].slice(0, 8);
  }

  if (/hypothesis/i.test(input.distilledContent)) {
    next.currentHypotheses = dedupe([input.distilledContent, ...next.currentHypotheses], 5);
  }

  if ((typeof meta.outcome === 'string' && meta.outcome === 'failure') || /fail|error|exception/i.test(input.distilledContent)) {
    next.recentFailures = dedupe([input.target ?? input.distilledContent, ...next.recentFailures], 5);
  }

  next.recentAttempts = dedupe([input.distilledContent, ...next.recentAttempts], 8);
  next.recentEvents = [
    {
      classification: input.classification,
      content: input.distilledContent,
      target: input.target,
      hash: typeof meta.contentHash === 'string' ? meta.contentHash : undefined,
      at: now,
    },
    ...next.recentEvents,
  ].slice(0, 20);

  if (input.classification === 'discard') next.signalStats.suppressed += 1;
  else next.signalStats.captured += 1;
  if (input.classification === 'session-only') next.signalStats.sessionOnly += 1;
  if (input.classification === 'durable-distilled') next.signalStats.durable += 1;
  if (input.classification === 'durable-raw+distilled') next.signalStats.durableWithRaw += 1;
  next.signalStats.tokensSaved += Number(meta.tokensSaved ?? 0);
  next.signalStats.placeRouted += meta.placeRouted ? 1 : 0;
  next.signalStats.graphEnriched += meta.graphEnriched ? 1 : 0;

  await db
    .update(schema.contextSessions)
    .set({
      metadata: serializeMetadata(next as unknown as Record<string, unknown>),
      updatedAt: new Date(),
    })
    .where(eq(schema.contextSessions.sessionId, input.sessionId));

  return next;
}

export async function compactSessionWorkingSet(sessionId: string, projectPath?: string): Promise<{ summary: string; workingSet: SessionWorkingSet }> {
  const workingSet = await getSessionWorkingSet(sessionId, projectPath);
  const lines: string[] = [];

  if (workingSet.currentHypotheses.length > 0) {
    lines.push(`Hypotheses: ${dedupe(workingSet.currentHypotheses, 3).join(' | ')}`);
  }
  if (workingSet.recentFailures.length > 0) {
    lines.push(`Failures: ${dedupe(workingSet.recentFailures, 3).join(' | ')}`);
  }
  if (workingSet.activeFiles.length > 0) {
    lines.push(`Active files: ${dedupe(workingSet.activeFiles, 5).join(', ')}`);
  }
  if (workingSet.activePlaces.length > 0) {
    lines.push(`Active places: ${dedupe(workingSet.activePlaces, 4).join(', ')}`);
  }
  if (workingSet.graphEntities.length > 0) {
    lines.push(`Graph entities: ${dedupe(workingSet.graphEntities, 4).join(', ')}`);
  }
  if (workingSet.recentCommands.length > 0) {
    lines.push(`Recent commands: ${dedupe(workingSet.recentCommands.map((entry) => entry.command), 3).join(' | ')}`);
  }
  // Batch 7 fallback: remember-writes and session parses land here as
  // recentAttempts. Without this line the wake-up summary stays empty
  // ("No working set yet") even when real activity exists.
  if (lines.length === 0 && workingSet.recentAttempts.length > 0) {
    const attempts = dedupe(workingSet.recentAttempts, 3)
      .map((a) => a.slice(0, 120))
      .join(' | ');
    lines.push(`Recent activity: ${attempts}`);
  }

  return {
    summary: lines.join('\n'),
    workingSet,
  };
}

export async function getProjectSignalStats(projectPath: string) {
  const { db, schema } = await getDbClient();
  const project = await getProjectByPath(projectPath);
  if (!project) {
    return EMPTY_WORKING_SET('project-stats', projectPath).signalStats;
  }

  const rows = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.projectId, project.id));

  return rows.reduce((acc: any, row: any) => {
    const workingSet = normalizeSessionMetadata(deserializeMetadata(row.metadata ?? null), row.sessionId, projectPath);
    acc.captured += workingSet.signalStats.captured;
    acc.suppressed += workingSet.signalStats.suppressed;
    acc.sessionOnly += workingSet.signalStats.sessionOnly;
    acc.durable += workingSet.signalStats.durable;
    acc.durableWithRaw += workingSet.signalStats.durableWithRaw;
    acc.tokensSaved += workingSet.signalStats.tokensSaved;
    return acc;
  }, { ...EMPTY_WORKING_SET('project-stats', projectPath).signalStats });
}

export async function getLatestProjectWorkingSetSummary(projectPath: string): Promise<string> {
  const { db, schema } = await getDbClient();
  const project = await getProjectByPath(projectPath);
  if (!project) return '';

  const rows = await db
    .select()
    .from(schema.contextSessions)
    .where(eq(schema.contextSessions.projectId, project.id));

  const latest = rows.sort((a: any, b: any) => {
    const left = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const right = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return right - left;
  })[0];

  if (!latest) return '';
  return compactSessionWorkingSet(latest.sessionId, projectPath).then((result) => result.summary);
}

/* ------------------------------------------------------------------ */
/* Batch 7: signals from parsed harness sessions                       */
/* ------------------------------------------------------------------ */

/**
 * Minimal chunk shape the signal extractor needs. Structurally compatible
 * with core/sessions Chunk so adapters can pass parsed chunks directly.
 */
export interface ParsedSessionChunkSignal {
  type?: string;
  content?: string;
  files?: string[];
}

/**
 * Extract path-like tokens (must contain a slash) from free text so plain
 * user/assistant message text still yields "files touched" signals.
 */
function extractFilePaths(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Za-z0-9_.\-@\\/\[\](){}]+[/\\][A-Za-z0-9_.\-@\\/\[\](){}]+/g);
  if (!matches) return [];
  return matches
    .filter((p) => /\.[A-Za-z0-9]{1,8}$/.test(p) || /[\\/]/.test(p))
    .slice(0, 4);
}

export function deriveSignalsFromChunks(chunks: ParsedSessionChunkSignal[]): {
  activeFiles: string[];
  commands: string[];
  hypotheses: string[];
} {
  const activeFiles = new Set<string>();
  const commands: string[] = [];
  const hypotheses: string[] = [];

  for (const chunk of chunks.slice(0, 40)) {
    const content = typeof chunk?.content === 'string' ? chunk.content : '';
    if (!content) continue;

    for (const f of chunk.files ?? []) {
      if (f) activeFiles.add(f);
    }
    for (const f of extractFilePaths(content)) {
      activeFiles.add(f);
    }

    if (chunk.type === 'command' || /^\s*(\$|>|bun |npm |pnpm |git |cargo |python |pytest|uv )/.test(content)) {
      commands.push(content.replace(/\s+/g, ' ').trim().slice(0, 160));
    }
    if (/hypothes/i.test(content)) {
      hypotheses.push(content.replace(/\s+/g, ' ').trim().slice(0, 200));
    }
  }

  return {
    activeFiles: [...activeFiles].slice(0, 8),
    commands: commands.slice(0, 5),
    hypotheses: hypotheses.slice(0, 3),
  };
}

/**
 * Record working-set signals from a freshly parsed harness session
 * (Batch 7 ingestion path). Files touched, commands run, and hypotheses
 * mentioned become wake-up-summary activity. Best-effort: never throws.
 */
export async function recordParsedSessionSignals(input: {
  sessionId: string;
  projectPath?: string;
  chunks: ParsedSessionChunkSignal[];
}): Promise<boolean> {
  if (!input.projectPath || !input.chunks?.length) return false;
  try {
    const signals = deriveSignalsFromChunks(input.chunks);
    if (
      signals.activeFiles.length === 0 &&
      signals.commands.length === 0 &&
      signals.hypotheses.length === 0
    ) {
      return false;
    }
    await recordSessionSignal({
      sessionId: input.sessionId,
      projectPath: input.projectPath,
      classification: 'durable-distilled',
      distilledContent:
        signals.hypotheses[0] ??
        signals.commands[0] ??
        `Parsed session activity (${input.chunks.length} chunks)`,
      toolName: 'session-ingest',
      target: input.sessionId,
      metadata: {
        activeFiles: signals.activeFiles,
        command: signals.commands[0],
        outcome: undefined,
      },
    });
    // Additional command entries keep recentCommands rich without spamming events.
    for (const command of signals.commands.slice(1, 4)) {
      await recordSessionSignal({
        sessionId: input.sessionId,
        projectPath: input.projectPath,
        classification: 'session-only',
        distilledContent: command,
        toolName: 'session-ingest',
        target: undefined,
        metadata: { command },
      });
    }
    return true;
  } catch {
    return false;
  }
}
