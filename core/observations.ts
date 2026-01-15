import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { ensureProject, getProjectByPath } from './projects.js';
import { fromSqliteJson, toSqliteJson } from '../features/memory/serialization.js';
import { createDatabaseClient } from './database.js';

export type ObservationType = 'tool_use' | 'file_change' | 'error' | 'pattern' | 'insight';

export interface ObservationInput {
  type: ObservationType;
  action: string;
  target?: string;
  summary: string;
  details?: Record<string, unknown>;
  session?: string;
  project?: string;
}

export interface ObservationRecord {
  id: string;
  projectId?: string | null;
  conversationId?: string | null;
  type: ObservationType;
  action: string;
  target?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export async function createObservation(input: ObservationInput): Promise<ObservationRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const project = await ensureProject(input.project);
  const embedding = await getEmbedding(input.summary);
  const id = randomUUID();

  if (config.isTeamMode) {
    await db.insert(schema.observations).values({
      id,
      projectId: project?.id ?? null,
      type: input.type,
      action: input.action,
      target: input.target ?? null,
      summary: input.summary,
      details: input.details ?? null,
      embedding: embedding ?? null,
    });
  } else {
    await db.insert(schema.observations).values({
      id,
      projectId: project?.id ?? null,
      type: input.type,
      action: input.action,
      target: input.target ?? null,
      summary: input.summary,
      details: toSqliteJson(input.details ?? null),
      embeddingJson: toSqliteJson(embedding ?? null),
    });
  }

  return {
    id,
    projectId: project?.id ?? null,
    conversationId: null,
    type: input.type,
    action: input.action,
    target: input.target ?? null,
    summary: input.summary,
    details: input.details ?? null,
  };
}

export async function getObservationsForProject(projectPath: string, limit: number): Promise<ObservationRecord[]> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const project = await getProjectByPath(projectPath);
    if (!project) return [];

    const rows = await db.select().from(schema.observations)
      .where(eq(schema.observations.projectId, project.id))
      .orderBy(desc(schema.observations.createdAt))
      .limit(limit);

    return rows.map((row: any) => normalizeObservation(row));
  } catch (error: any) {
    if (error.message?.includes('Database unavailable') ||
        error.message?.includes('not a valid Win32 application')) {
      return []; // Graceful degradation - database unavailable
    }
    throw error;
  }
}

function normalizeObservation(row: any): ObservationRecord {
  const details = config.isTeamMode ? row.details : fromSqliteJson<Record<string, unknown>>(row.details ?? null);
  return {
    id: row.id,
    projectId: row.projectId ?? row.project_id ?? null,
    conversationId: row.conversationId ?? row.conversation_id ?? null,
    type: row.type,
    action: row.action,
    target: row.target ?? null,
    summary: row.summary,
    details,
    createdAt: normalizeTimestamp(row.createdAt ?? row.created_at),
  };
}

function normalizeTimestamp(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}
