import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { getEmbedding } from './embeddings.js';
import { ensureProject, getProjectByPath } from './projects.js';
import { fromSqliteJson, toSqliteJson } from '../features/memory/serialization.js';
import { createDatabaseClient } from './database.js';
import { normalizeTimestamp, isDatabaseUnavailableError, prepareEmbedding } from './utils.js';

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

  const baseValues = {
    id,
    projectId: project?.id ?? null,
    type: input.type,
    action: input.action,
    target: input.target ?? null,
    summary: input.summary,
  };

  const embeddingValues = prepareEmbedding(embedding);
  const detailsValue = config.isTeamMode ? input.details ?? null : toSqliteJson(input.details ?? null);

  await db.insert(schema.observations).values({
    ...baseValues,
    details: detailsValue,
    ...embeddingValues,
  });

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
    if (isDatabaseUnavailableError(error)) {
      return []; // Graceful degradation - database unavailable
    }
    throw error;
  }
}

export async function getRecentObservations(projectPath: string, limit: number = 10): Promise<ObservationRecord[]> {
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
    if (isDatabaseUnavailableError(error)) {
      return [];
    }
    console.error('[squish] Error getting recent observations:', error);
    return [];
  }
}

export async function getObservationById(observationId: string): Promise<ObservationRecord | null> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    const rows = await db.select().from(schema.observations)
      .where(eq(schema.observations.id, observationId))
      .limit(1);

    if (rows.length === 0) return null;
    return normalizeObservation(rows[0]);
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return null;
    }
    console.error('[squish] Error getting observation:', error);
    return null;
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
