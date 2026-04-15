import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { logger } from '../../core/logger.js';
import { getOrCreateProject, requireProject } from '../../core/projects.js';
import { getEmbedding } from '../../core/embeddings.js';
import { normalizeTags, serializeTags, deserializeTags, serializeMetadata, deserializeMetadata } from '../../core/memory/serialization.js';
import { normalizeTimestamp, clampLimit, prepareEmbedding } from '../lib/utils.js';
import { validateUuid, requireUuid } from '../lib/validation.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { hybridSearch as hybridSearchImpl } from './hybrid-search.js';
import { calculateImportance } from './importance.js';
import { detectMemorySignals, MemorySignals } from './trigger-detector.js';
import { resolveContradictions, applySupersession } from './contradiction-resolver.js';
import { encrypt, decrypt } from '../security/encrypt.js';
import { estimateTokens } from '../context/context-window.js';
import { getDbClient } from '../lib/db-client.js';

// Define MemoryType locally to avoid circular dependency
export type MemoryType = 'observation' | 'fact' | 'decision' | 'context' | 'preference' | 'note' | 'task';

export interface MemoryRecord {
  id: string;
  projectId?: string | null;
  type: MemoryType;
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  recordedAt?: string | null;
  similarity?: number;
  importance?: number;
  confidenceLevel?: 'certain' | 'speculative' | 'outdated' | null;
}

export interface RememberInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  project?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  // Rich context fields (Agent 4 feedback)
  reasoning?: string;    // Why it's true/important
  memoryContext?: string; // What triggered this memory
  examples?: string;      // When to apply this knowledge
  exceptions?: string;    // When NOT to apply
  // Hot/Cold tier (replaces isHighRes)
  tier?: 'hot' | 'cold';  // Memory tier: hot = active, cold = archived
  // Namespace for grouping
  namespaceId?: string;   // Assign to namespace
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  project?: string;
}

// SearchResult extends the shared MemoryRecord from normalization.ts
export interface SearchResult extends MemoryRecord {
  similarity: number;
}

export async function rememberMemory(input: RememberInput): Promise<MemoryRecord> {
  const { db, schema } = await getDbClient();
  const tags = normalizeTags(input.tags);
  const project = await getOrCreateProject(input.project);
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

  const tokensEstimate = estimateTokens(input.content);

  let tagsValue = serializeTags(tags);
  const enrichedMetadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    // Rich context fields (Agent 4 feedback)
    reasoning: input.reasoning,
    memoryContext: input.memoryContext,
    examples: input.examples,
    exceptions: input.exceptions,
    memorySignals: {
      explicitTriggers: signals.explicitTriggers,
      implicit: signals.implicit,
      priority: signals.priority,
      requiresConflictCheck: signals.implicit.correction,
    },
  };
  let metadataValue = serializeMetadata(enrichedMetadata);

  // Prepare fields for insertion, handling optional encryption
  let insertValues: any = {
    ...baseValues,
    tags: tagsValue,
    metadata: metadataValue,
    ...embeddingValues,
    importanceScore: importance.score,
    lastImportanceRecalc: new Date(),
    tokensEstimate,
    createdAt: new Date(),
    status: 'active',
    tier: input.tier || 'hot', // Default to hot tier
  };

  // Add namespace if specified
  if (input.namespaceId) {
    insertValues.namespaceId = input.namespaceId;
  }

  // For cold tier, store original content in metadata
  if (input.tier === 'cold') {
    enrichedMetadata.originalContent = input.content;
  }

  if (config.clientEncryptionEnabled) {
    const { ciphertext, nonce } = encrypt(input.content);
    insertValues.encrypted_content = ciphertext;
    insertValues.encryption_nonce = nonce;
    insertValues.is_encrypted = true;
    // Store empty placeholder for plain content
    insertValues.content = '';
  } else {
    insertValues.content = input.content;
    insertValues.is_encrypted = false;
  }

  await db.insert(schema.memories).values(insertValues);

  // Append to Obsidian vault if enabled and hot tier (NEW)
  if (config.obsidianEnabled && config.obsidianVaultPath && insertValues.tier === 'hot') {
    try {
      const { appendToObsidianVault } = await import('../integrations/obsidian-vault.js');
      await appendToObsidianVault({
        content: input.content,
        id,
        type,
        tags,
        reasoning: input.reasoning,
        memoryContext: input.memoryContext,
        examples: input.examples,
        exceptions: input.exceptions,
        source: input.source,
      }, config.obsidianVaultPath);
    } catch (error) {
      logger.warn(`[Obsidian] Failed to append to vault: ${error}`);
    }
  }

   // Resolve contradictions and supersede old memories (async, non-blocking)
   resolveContradictions(input.content, type, project?.id)
     .then(async (result) => {
       if (result.supersededIds.length > 0) {
         await applySupersession(id, result.supersededIds, result.confidence);
         // Update metadata with contradiction resolution info
         const updatedMetadata: Record<string, unknown> = {
           ...enrichedMetadata,
           contradictionResolution: {
             supersededCount: result.supersededIds.length,
             confidence: result.confidence,
             reason: result.reason,
           },
          };
          metadataValue = serializeMetadata(updatedMetadata);
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
  importance: importance.score as number,
};

  return memoryRecord;
}

export async function getMemory(id: string, incrementAccess: boolean = true): Promise<MemoryRecord | null> {
  try {
    // Validate UUID
    requireUuid(id);

    const { db, schema } = await getDbClient();
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

		let content = row.content;
		if (row.is_encrypted) {
		  try {
		    content = decrypt(row.encrypted_content, row.encryption_nonce);
		  } catch (e) {
		    console.warn('Failed to decrypt memory', e);
		    content = row.content; // fall back to stored content
		  }
		}
		const decryptedRow = { ...row, content };
		return normalizeMemory(decryptedRow);
	} catch (error: any) {
		throw error;
	}
}

export async function setConfidence(id: string, level: 'certain' | 'speculative' | 'outdated'): Promise<boolean> {
  try {
    // Validate UUID
    requireUuid(id);

    const { db, schema } = await getDbClient();
    await db.update(schema.memories)
			.set({ confidenceLevel: level, updatedAt: new Date() })
			.where(eq(schema.memories.id, id));
		return true;
	} catch (error: any) {
		throw error;
	}
}

export async function getRecent(projectPath: string, limit: number): Promise<MemoryRecord[]> {
  try {
    const { db } = await getDbClient();
    const sqlite = db.$client as any;
    const project = await requireProject(projectPath);

    // Use raw SQL to avoid drizzle column name issues
    const rows = sqlite.prepare(`
      SELECT * FROM memories 
      WHERE project_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(project.id, limit);

    return rows.map((row: any) => normalizeMemory(row));
  } catch (error: any) {
    throw error;
  }
}

export async function search(input: SearchInput): Promise<SearchResult[]> {
  const limit = clampLimit(input.limit, 10, 1, 100);
  const tags = normalizeTags(input.tags);

  // Get results from database (hybrid search: BM25 + vectors with RRF)
  let dbResults: SearchResult[];
  if (config.isTeamMode) {
    dbResults = await searchMemoriesPostgres(input, tags, limit);
  } else {
    // Use hybrid search for SQLite (BM25 + vectors with RRF)
    dbResults = await hybridSearchImpl(input, { limit });
  }

  return dbResults.slice(0, limit);
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
        const buffer = embeddingData.buffer;
        const arrayBuffer = buffer instanceof ArrayBuffer 
          ? buffer 
          : (buffer as unknown as ArrayBuffer);
        const floatArray = new Float32Array(arrayBuffer);
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
  const { db } = await getDbClient();
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
     const project = await requireProject(input.project);
     projectId = project.id;
     conditions.push('m.project_id = ?');
     params.push(project.id);
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
  const { db } = await getDbClient();
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
     const project = await requireProject(input.project);
     values.push(project.id);
     whereParts.push(`project_id = $${values.length}`);
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
       valid_from as "validFrom",
       valid_to as "validTo",
       recorded_at as "recordedAt"
     FROM memories
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1}`,
     [...values, limit]
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
       created_at as "createdAt",
       valid_from as "validFrom",
       valid_to as "validTo",
       recorded_at as "recordedAt"
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
  const tags = deserializeTags(row.tags ?? null);
  const metadata = deserializeMetadata(row.metadata ?? null);

  const createdAtStr = normalizeTimestamp(row.createdAt ?? row.created_at);

  return {
    id: row.id,
    projectId: row.projectId ?? row.project_id ?? null,
    type: row.type,
    content: row.content,
    summary: row.summary ?? null,
    tags,
    metadata,
    createdAt: createdAtStr,
    validFrom: row.validFrom ?? row.valid_from ?? null,
    validTo: row.validTo ?? row.valid_to ?? null,
    recordedAt: row.recordedAt ?? row.recorded_at ?? null,
    confidenceLevel: row.confidenceLevel ?? row.confidence_level ?? null,
  };
}
