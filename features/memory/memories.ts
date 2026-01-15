import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { ensureProject, getProjectByPath } from '../../core/projects.js';
import { getEmbedding } from '../../core/embeddings.js';
import { fromSqliteJson, fromSqliteTags, normalizeTags, toSqliteJson, toSqliteTags } from '../../features/memory/serialization.js';
import { createDatabaseClient } from '../../core/database.js';

export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference';

export interface RememberInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  project?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  project?: string;
}

export interface MemoryRecord {
  id: string;
  projectId?: string | null;
  type: MemoryType;
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export async function rememberMemory(input: RememberInput): Promise<MemoryRecord> {
  let db: any;
  try {
    db = createDatabaseClient(await getDb());
  } catch (error) {
    throw new Error(`Database unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  const schema = await getSchema();
  const tags = normalizeTags(input.tags);
  const project = await ensureProject(input.project);
  const embedding = await getEmbedding(input.content);
  const id = randomUUID();
  const type = input.type ?? 'observation';

  if (config.isTeamMode) {
    await db.insert(schema.memories).values({
      id,
      projectId: project?.id ?? null,
      type,
      content: input.content,
      tags: tags.length ? tags : null,
      metadata: input.metadata ?? null,
      source: input.source ?? 'mcp',
      embedding: embedding ?? null,
    });
  } else {
    await db.insert(schema.memories).values({
      id,
      projectId: project?.id ?? null,
      type,
      content: input.content,
      tags: toSqliteTags(tags),
      metadata: toSqliteJson(input.metadata ?? null),
      source: input.source ?? 'mcp',
      embeddingJson: toSqliteJson(embedding ?? null),
    });
  }

  return {
    id,
    projectId: project?.id ?? null,
    type,
    content: input.content,
    tags,
    metadata: input.metadata ?? null,
  };
}

export async function getMemoryById(id: string): Promise<MemoryRecord | null> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const rows = await db.select().from(schema.memories).where(eq(schema.memories.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return normalizeMemory(row);
  } catch (error: any) {
    if (error.message?.includes('Database unavailable') ||
        error.message?.includes('not a valid Win32 application')) {
      return null; // Graceful degradation - database unavailable
    }
    throw error;
  }
}

export async function getRecentMemories(projectPath: string, limit: number): Promise<MemoryRecord[]> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const project = await getProjectByPath(projectPath);
    if (!project) return [];

    const rows = await db.select().from(schema.memories)
      .where(eq(schema.memories.projectId, project.id))
      .orderBy(desc(schema.memories.createdAt))
      .limit(limit);

    return rows.map((row: any) => normalizeMemory(row));
  } catch (error: any) {
    if (error.message?.includes('Database unavailable') ||
        error.message?.includes('not a valid Win32 application')) {
      return []; // Graceful degradation - database unavailable
    }
    throw error;
  }
}

export async function searchMemories(input: SearchInput): Promise<MemoryRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
  const tags = normalizeTags(input.tags);

  if (config.isTeamMode) {
    return await searchMemoriesPostgres(input, tags, limit);
  }

  return await searchMemoriesSqlite(input, tags, limit);
}

async function searchMemoriesSqlite(input: SearchInput, tags: string[], limit: number): Promise<MemoryRecord[]> {
  const db = createDatabaseClient(await getDb());
  const sqlite = db.$client as any;
  const params: Array<string | number> = [input.query];
  let where = 'memories_fts MATCH ?';

  if (input.type) {
    where += ' AND m.type = ?';
    params.push(input.type);
  }

  if (tags.length) {
    where += ' AND m.tags IS NOT NULL AND (' + tags.map(() => 'm.tags LIKE ?').join(' OR ') + ')';
    params.push(...tags.map((tag) => `%${tag}%`));
  }

  if (input.project) {
    const project = await getProjectByPath(input.project);
    if (project) {
      where += ' AND m.project_id = ?';
      params.push(project.id);
    }
  }

  params.push(limit);

  const statement = sqlite.prepare(`
    SELECT
      m.id as id,
      m.project_id as projectId,
      m.type as type,
      m.content as content,
      m.summary as summary,
      m.tags as tags,
      m.metadata as metadata,
      m.created_at as createdAt
    FROM memories m
    JOIN memories_fts ON memories_fts.rowid = m.rowid
    WHERE ${where}
    ORDER BY m.created_at DESC
    LIMIT ?
  `);

  const rows = statement.all(...params) as Array<{
    id: string;
    projectId: string | null;
    type: string;
    content: string;
    summary: string | null;
    tags: string | null;
    metadata: string | null;
    createdAt: string | null;
  }>;
  return rows.map((row: any) => normalizeMemory(row));
}

async function searchMemoriesPostgres(input: SearchInput, tags: string[], limit: number): Promise<MemoryRecord[]> {
  const db = createDatabaseClient(await getDb());
  const values: Array<string | string[] | number[] | null> = [];
  const whereParts: string[] = [];

  values.push(`%${input.query}%`);
  whereParts.push(`content ILIKE $1`);

  if (input.type) {
    values.push(input.type);
    whereParts.push(`type = $${values.length}`);
  }

  if (tags.length) {
    values.push(tags);
    whereParts.push(`tags && $${values.length}::text[]`);
  }

  if (input.project) {
    const project = await getProjectByPath(input.project);
    if (project) {
      values.push(project.id);
      whereParts.push(`project_id = $${values.length}`);
    }
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const embedding = await getEmbedding(input.query);

  if (embedding) {
    const rows = await (db.$client as any).query(
      `SELECT
        id,
        project_id as "projectId",
        type,
        content,
        summary,
        tags,
        metadata,
        created_at as "createdAt"
      FROM memories
      ${whereClause}
      ORDER BY embedding <-> $${values.length + 1}
      LIMIT $${values.length + 2}`,
      [...values, embedding, limit]
    );
    return rows.rows.map((row: any) => normalizeMemory(row));
  }

  const rows = await (db.$client as any).query(
    `SELECT
      id,
      project_id as "projectId",
      type,
      content,
      summary,
      tags,
      metadata,
      created_at as "createdAt"
    FROM memories
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1}`,
    [...values, limit]
  );

  return rows.rows.map((row: any) => normalizeMemory(row));
}

function normalizeMemory(row: any): MemoryRecord {
  const tags = config.isTeamMode ? (row.tags ?? []) : fromSqliteTags(row.tags ?? null);
  const metadata = config.isTeamMode ? row.metadata : fromSqliteJson<Record<string, unknown>>(row.metadata ?? null);

  return {
    id: row.id,
    projectId: row.projectId ?? row.project_id ?? null,
    type: row.type,
    content: row.content,
    summary: row.summary ?? null,
    tags,
    metadata,
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
