import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { getEmbedding } from '../embeddings.js';
import { getOrCreateProject, requireProject } from '../projects.js';
import { serializeMetadata, deserializeMetadata } from '../memory/serialization.js';
import { normalizeTimestamp, prepareEmbedding } from '../lib/utils.js';
import { logger } from '../logger.js';
import { getDbClient } from '../lib/db-client.js';

export type ObservationType = 'tool_use' | 'file_change' | 'error' | 'pattern' | 'insight' | 'success' | 'failure' | 'fix';

export interface ObservationInput {
  type: ObservationType;
  action: string;
  target?: string;
  summary: string;
  details?: Record<string, unknown>;
  session?: string;
  project?: string;
}

export type LearningType = 'success' | 'failure' | 'fix' | 'observation';

export interface LearningInput {
  type: LearningType;
  content: string;
  context?: string;
  action?: string;
  observationType?: Exclude<ObservationType, 'success' | 'failure' | 'fix'>;
  target?: string;
  project?: string;
}

export async function createLearning(input: LearningInput): Promise<ObservationRecord> {
  if (input.type === 'observation') {
    return addObservation({
      type: input.observationType ?? 'insight',
      action: input.action ?? 'learn',
      summary: input.content,
      target: input.target,
      details: {
        learningType: input.type,
        learningContent: input.content,
        learningContext: input.context,
      },
      project: input.project,
    });
  }

  return addObservation({
    type: input.type,
    action: input.content,
    summary: input.context || input.content,
    target: input.target,
    details: { learningContent: input.content, learningContext: input.context },
    project: input.project,
  });
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

export async function addObservation(input: ObservationInput): Promise<ObservationRecord> {
  const { db, schema } = await getDbClient();
  const project = await getOrCreateProject(input.project);
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
  const detailsValue = serializeMetadata(input.details);

  await db.insert(schema.observations).values({
    ...baseValues,
    details: detailsValue,
    ...embeddingValues,
    createdAt: new Date(),
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

export async function getObservations(projectPath: string, limit: number): Promise<ObservationRecord[]> {
  try {
    const { db, schema } = await getDbClient();
    const project = await requireProject(projectPath);

    const rows = await db.select().from(schema.observations)
      .where(eq(schema.observations.projectId, project.id))
      .orderBy(desc(schema.observations.createdAt))
      .limit(limit);

    return rows.map((row: any) => normalizeObservation(row));
  } catch (error: any) {
    throw error;
  }
}

export async function getRecentObservations(projectPath: string, limit: number = 10): Promise<ObservationRecord[]> {
  try {
    const { db, schema } = await getDbClient();
    const project = await requireProject(projectPath);

    const rows = await db.select().from(schema.observations)
      .where(eq(schema.observations.projectId, project.id))
      .orderBy(desc(schema.observations.createdAt))
      .limit(limit);

    return rows.map((row: any) => normalizeObservation(row));
  } catch (error: any) {
    logger.error('Error getting recent observations', error);
    throw error;
  }
}

export async function getObservationById(observationId: string): Promise<ObservationRecord | null> {
  try {
    const { db, schema } = await getDbClient();
    const rows = await db.select().from(schema.observations)
      .where(eq(schema.observations.id, observationId))
      .limit(1);

    if (rows.length === 0) return null;
    return normalizeObservation(rows[0]);
  } catch (error: any) {
    logger.error('Error getting observation', error);
    throw error;
  }
}

function normalizeObservation(row: any): ObservationRecord {
  const details = deserializeMetadata(row.details ?? null);
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
