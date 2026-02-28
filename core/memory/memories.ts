import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { ensureProject, getProjectByPath } from '../../core/projects.js';
import { getEmbedding } from '../../core/embeddings.js';
import { fromSqliteJson, fromSqliteTags, normalizeTags, toSqliteJson, toSqliteTags } from '../../core/memory/serialization.js';
import { createDatabaseClient } from '../../core/database.js';
import { normalizeTimestamp, isDatabaseUnavailableError, clampLimit, prepareEmbedding } from '../../core/utils.js';
import { getQMDMemorySync } from '../../core/sync/qmd-sync.js';
import { hybridSearch as hybridSearchImpl } from './hybrid-search.js';
import { calculateImportance } from './importance.js';
import { detectMemorySignals, MemorySignals } from './trigger-detector.js';
import { resolveContradictions, applySupersession } from './contradiction-resolver.js';

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
  similarity?: number; // Vector similarity score (0-1)
}

export interface SearchResult extends MemoryRecord {
  similarity: number;
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
  const signals = detectMemorySignals(input.content);
  const type = input.type ?? signals.suggestedType;

  const baseValues = {
    id,
    projectId: project?.id ?? null,
    type,
    content: input.content,
    source: input.source ?? 'mcp',
  };

  // Calculate initial importance score
  const importance = calculateImportance({
    type,
    createdAt: new Date().toISOString(),
    accessCount: 0,
    usageCount: 0,
    isPinned: false,
    isProtected: false,
    isImmutable: false,
  });

  const embeddingValues = prepareEmbedding(embedding);
  
  let tagsValue;
  if (config.isTeamMode) {
    tagsValue = tags.length ? tags : null;
  } else {
    tagsValue = toSqliteTags(tags);
  }
  
  let metadataValue;
  const enrichedMetadata: Record<string, unknown> & {
    memorySignals: {
      explicitTriggers: string[];
      implicit: MemorySignals['implicit'];
      priority: string;
      requiresConflictCheck: boolean;
    };
    contradictionResolution?: {
      supersededCount: number;
      confidence: number;
      reason: string;
    };
  } = {
    ...(input.metadata ?? {}),
    memorySignals: {
      explicitTriggers: signals.explicitTriggers,
      implicit: signals.implicit,
      priority: signals.priority,
      requiresConflictCheck: signals.implicit.correction,
    },
  };

  if (config.isTeamMode) {
    metadataValue = enrichedMetadata;
  } else {
    metadataValue = toSqliteJson(enrichedMetadata);
  }

  await db.insert(schema.memories).values({
    ...baseValues,
    tags: tagsValue,
    metadata: metadataValue,
    ...embeddingValues,
    importanceScore: importance.score,
    lastImportanceRecalc: new Date(),
  });

  // Resolve contradictions and supersede old memories (async, non-blocking)
  resolveContradictions(input.content, type, project?.id)
    .then(async (result) => {
      if (result.supersededIds.length > 0) {
        await applySupersession(id, result.supersededIds, result.confidence);
        enrichedMetadata.contradictionResolution = {
          supersededCount: result.supersededIds.length,
          confidence: result.confidence,
          reason: result.reason,
        };
      }
    })
    .catch((error) => {
      import('../logger.js').then(({ logger }) => {
        logger?.debug?.(`Contradiction resolution failed: ${error}`);
      });
    });

  // Sync to QMD if enabled (async, don't block)
  const memoryRecord: MemoryRecord = {
    id,
    projectId: project?.id ?? null,
    type,
    content: input.content,
    tags,
    metadata: enrichedMetadata,
  };
  if (config.qmdEnabled) {
    getQMDMemorySync().then(sync => sync.syncMemory(memoryRecord))
      .catch((error) => {
        // Silently fail - QMD sync is optional
        import('../logger.js').then(({ logger }) => {
          logger?.debug?.(`QMD sync failed: ${error}`);
        });
      });
  }

  return memoryRecord;
}

export async function getMemoryById(id: string, incrementAccess: boolean = true): Promise<MemoryRecord | null> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const rows = await db.select().from(schema.memories).where(eq(schema.memories.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    // Increment access count and update last accessed time
    if (incrementAccess) {
      await db.update(schema.memories)
        .set({
          accessCount: (row.accessCount ?? 0) + 1,
          lastAccessedAt: new Date(),
        })
        .where(eq(schema.memories.id, id));
    }

    return normalizeMemory(row);
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
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
    if (isDatabaseUnavailableError(error)) {
      return []; // Graceful degradation - database unavailable
    }
    throw error;
  }
}

export async function searchMemories(input: SearchInput): Promise<SearchResult[]> {
  const limit = clampLimit(input.limit, 10, 1, 100);
  const tags = normalizeTags(input.tags);

  if (config.isTeamMode) {
    return await searchMemoriesPostgres(input, tags, limit);
  }

  // Use hybrid search for SQLite (BM25 + vectors with RRF)
  return await hybridSearchImpl(input, { limit });
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Parse embedding from SQLite storage
 */
function parseEmbedding(embeddingData: any): number[] | null {
  if (!embeddingData) return null;
  
  // If it's already an array
  if (Array.isArray(embeddingData)) return embeddingData;
  
  // If it's a Buffer/Uint8Array
  if (embeddingData instanceof Uint8Array || Buffer.isBuffer(embeddingData)) {
    // Try to parse as JSON first
    try {
      const json = JSON.parse(embeddingData.toString());
      if (Array.isArray(json)) return json;
    } catch {
      // Not JSON, try Float32Array
      try {
        const floatArray = new Float32Array(embeddingData.buffer || embeddingData);
        return Array.from(floatArray);
      } catch {
        return null;
      }
    }
  }
  
  // If it's a string
  if (typeof embeddingData === 'string') {
    try {
      const parsed = JSON.parse(embeddingData);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  
  return null;
}

async function searchMemoriesSqlite(input: SearchInput, tags: string[], limit: number): Promise<SearchResult[]> {
  const db = createDatabaseClient(await getDb());
  const sqlite = db.$client as any;
  
  // Get embedding for the query (for semantic search)
  const queryEmbedding = await getEmbedding(input.query);
  
  // Build the base query
  const conditions: string[] = [];
  const params: any[] = [];
  
  if (input.type) {
    conditions.push('m.type = ?');
    params.push(input.type);
  }
  
  if (tags.length) {
    conditions.push('m.tags IS NOT NULL AND (' + tags.map(() => 'm.tags LIKE ?').join(' OR ') + ')');
    params.push(...tags.map((tag) => `%${tag}%`));
  }
  
  let projectId: string | null = null;
  if (input.project) {
    const project = await getProjectByPath(input.project);
    if (project) {
      projectId = project.id;
      conditions.push('m.project_id = ?');
      params.push(project.id);
    }
  }
  
  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  
  // Fetch memories with embeddings for semantic search
  const fetchLimit = Math.max(limit * 3, 50); // Fetch more for re-ranking
  
  const statement = sqlite.prepare(`
    SELECT
      m.id as id,
      m.project_id as projectId,
      m.type as type,
      m.content as content,
      m.summary as summary,
      m.tags as tags,
      m.metadata as metadata,
      m.embedding as embedding,
      m.embedding_json as embeddingJson,
      m.created_at as createdAt
    FROM memories m
    ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ?
  `);
  
  const rows = statement.all(...params, fetchLimit) as Array<{
    id: string;
    projectId: string | null;
    type: string;
    content: string;
    summary: string | null;
    tags: string | null;
    metadata: string | null;
    embedding: any;
    embeddingJson: any;
    createdAt: string | null;
  }>;
  
  if (rows.length === 0) return [];
  
  // If we have query embedding, do semantic ranking
  if (queryEmbedding) {
    const scored = rows.map((row) => {
      let embedding = parseEmbedding(row.embedding);
      
      // Fallback to embedding_json if embedding blob is null
      if (!embedding && row.embeddingJson) {
        embedding = parseEmbedding(row.embeddingJson);
      }
      
      const score = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
      return { row, score };
    });
    
    // Sort by similarity score (descending)
    scored.sort((a, b) => b.score - a.score);
    
    // Return top results WITH their similarity scores
    return scored.slice(0, limit).map((item): SearchResult => ({
      ...normalizeMemory(item.row),
      similarity: item.score,
    }));
  }
  
  // No embeddings available, return results with 0 similarity
  return rows.slice(0, limit).map((row, i): SearchResult => ({
    ...normalizeMemory(row),
    similarity: 0,
  }));
}

async function searchMemoriesPostgres(input: SearchInput, tags: string[], limit: number): Promise<SearchResult[]> {
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
        created_at as "createdAt",
        1 - (embedding <-> $${values.length + 1}) as similarity
      FROM memories
      ${whereClause}
      ORDER BY embedding <-> $${values.length + 1}
      LIMIT $${values.length + 2}`,
      [...values, embedding, limit]
    );
    return rows.rows.map((row: any): SearchResult => ({
      ...normalizeMemory(row),
      similarity: row.similarity ?? 0,
    }));
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

  return rows.rows.map((row: any): SearchResult => ({
    ...normalizeMemory(row),
    similarity: 0,
  }));
}

function normalizeMemory(row: any): MemoryRecord {
  let tags: string[];
  if (config.isTeamMode) {
    tags = row.tags ?? [];
  } else {
    tags = fromSqliteTags(row.tags ?? null);
  }
  
  let metadata: Record<string, unknown> | null;
  if (config.isTeamMode) {
    metadata = row.metadata;
  } else {
    metadata = fromSqliteJson<Record<string, unknown>>(row.metadata ?? null);
  }

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
