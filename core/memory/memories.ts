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
import { extractBeliefsFromMemory } from '../beliefs/extractor.js';
import { upsertBeliefsForMemory } from '../beliefs/store.js';
import { extractEntityNames } from './entity-extractor.js';
import { autoLinkByEntities } from '../associations.js';
import { addMemoryToGraph } from '../graph/graph-builder.js';
import { MemoryRecord, MemoryType } from '../lib/types.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { findOrCreateCluster, updateClusterStats } from '../clustering/cluster-engine.js';
import { evaluateCluster, shouldConsolidate, shouldSplit } from '../clustering/consolidation-check.js';

// MemoryType and MemoryRecord imported from ../lib/types.js

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
  // Namespace for grouping
  namespaceId?: string;   // Assign to namespace
  // Session metadata for temporal queries (Task 1)
  sessionId?: string;        // Session identifier for linking memories
  sessionStartTime?: string; // When this session started
  toolName?: string;     // Tool that generated this memory
  // Place routing (Method of Loci / MemPalace wings)
  placeType?: string;    // Place type to route memory (inbox, ref, wip, etc.)
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  project?: string;
  // Place and session filters for unified search (Task 2, Task 3)
  placeId?: string;        // Filter by place
  placeType?: string;     // Filter by place type (inbox, wip, archive, etc.)
  sessionId?: string;     // Filter by session
  sessionStartTime?: string; // Session start for temporal queries
}

// SearchResult extends the shared MemoryRecord from normalization.ts
export interface SearchResult extends MemoryRecord {
  similarity: number;
}

export async function rememberMemory(input: RememberInput): Promise<MemoryRecord> {
  const { db, schema } = await getDbClient();
  const tags = normalizeTags(input.tags);
  const project = input.project ? await getOrCreateProject(input.project) : null;
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
    // Session metadata for temporal queries (Task 1)
    sessionMetadata: {
      sessionId: input.sessionId,
      sessionStartTime: input.sessionStartTime,
      toolName: input.toolName,
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
  };

  // Add namespace if specified
  if (input.namespaceId) {
    insertValues.namespaceId = input.namespaceId;
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

  if (project?.id) {
    try {
      const beliefs = extractBeliefsFromMemory({
        memoryId: id,
        content: input.content,
        type,
        metadata: enrichedMetadata,
      });
      if (beliefs.length > 0) {
        await upsertBeliefsForMemory({
          projectId: project.id,
          memoryId: id,
          beliefs,
        });
      }
    } catch (beliefError) {
      logger.warn(`[Beliefs] Failed to derive beliefs for memory ${id}: ${beliefError}`);
    }
  }

   // Auto-link by entity overlap (synchronous - Task 5)
   // Now memories are immediately findable via associations after storage
   const entityNames = extractEntityNames(input.content);
   if (entityNames.length > 0 && project?.id) {
     try {
       const linked = await autoLinkByEntities(id, entityNames, project.id);
       if (linked > 0) logger.debug(`[AutoLink] Linked memory ${id} to ${linked} related memories`);
     } catch (err) {
       logger.debug(`[AutoLink] Failed: ${err}`);
     }
   }

   // Build graph for this memory (auto-build if enabled)
   // This populates the entity_entities and entity_relations tables
   if (config.graphAutoBuild && project?.id) {
     try {
       const graphResult = await addMemoryToGraph(id, {
         preferLLM: config.llmEnabled,
       });
       if (graphResult.entitiesCreated > 0 || graphResult.relationsCreated > 0) {
         logger.debug(`[Graph] Built graph for memory ${id}: ${graphResult.entitiesCreated} entities, ${graphResult.relationsCreated} relations`);
       }
     } catch (graphError) {
       logger.debug(`[Graph] Failed to build graph for memory ${id}: ${graphError}`);
     }
   }

   // Resolve contradictions and supersede old memories (async, non-blocking)
   // Benchmarks can skip this expensive path by setting SQUISH_SKIP_CONTRADICTION=true
   if (process.env.SQUISH_SKIP_CONTRADICTION !== 'true') {
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
   }

  // Sync to QMD if enabled (async, don't block)

  // Auto-assign to Inbox place by default (or specified placeType)
  await assignMemoryToDefaultPlace(id, project?.id, input.placeType || null);

  // Post-capture geometry check (non-blocking, fire-and-forget)
  // Evaluates whether the new memory's cluster is safe to consolidate
  const embeddingForGeo = parseEmbedding(embedding);
  if (config.consolidationGeometryAutoConsolidate && embeddingForGeo && embeddingForGeo.length > 0) {
    evaluateAndConsolidate(id, embeddingForGeo).catch((err: Error) =>
      logger.debug('Post-capture geometry check failed', err)
    );
  }

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
  const limit = clampLimit(input.limit, 10, 1, 500);
  const tags = normalizeTags(input.tags);

  // Always use hybrid search for both SQLite and PostgreSQL
  // Omitted project means truly global search.
  const dbResults = await hybridSearchImpl(input, { limit });

  return dbResults.slice(0, limit);
}

// parseEmbedding imported from ../lib/parse-embedding.js

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

/**
 * Find similar memories to prevent duplicates
 * Returns memories with similarity >= threshold
 */
export async function findSimilarMemories(
  content: string,
  threshold: number = 0.85,
  limit: number = 5
): Promise<SearchResult[]> {
  // Use search with high similarity
  const results = await search({
    query: content,
    limit,
  });
  
  // Filter by similarity threshold
  return results.filter(r => (r.similarity ?? 0) >= threshold);
}

/**
 * Post-capture geometry check and auto-consolidation.
 *
 * Non-blocking fire-and-forget function called after a new memory is stored.
 * Adds the memory to its nearest cluster, updates cluster stats, and
 * evaluates whether the cluster is safe to consolidate.
 *
 * If safe and autoConsolidate is enabled: triggers consolidation.
 * If unsafe and autoSplit is enabled: logs a split recommendation.
 *
 * @param memoryId - ID of the newly created memory
 * @param embedding - Embedding vector of the new memory
 */
async function evaluateAndConsolidate(
  memoryId: string,
  embedding: number[]
): Promise<void> {
  try {
    // Find or create the nearest cluster for this memory
    const clusterId = await findOrCreateCluster(memoryId, embedding);

    // Update cluster geometry stats (centroid, d_bar, d_eff, etc.)
    await updateClusterStats(clusterId);

    // Evaluate whether the cluster is safe to compress
    const decision = await evaluateCluster(clusterId);

    if (decision.safeToCompress && config.consolidationGeometryAutoConsolidate) {
      logger.debug(`Post-capture: cluster ${clusterId} is safe to consolidate ` +
        `(d_bar=${decision.dBar.toFixed(4)}, d_eff=${decision.dEff.toFixed(2)})`);
      // Note: actual consolidation happens in the consolidation engine run.
      // This check just logs readiness; the engine will pick it up.
    } else if (!decision.safeToCompress && config.consolidationGeometryAutoSplit) {
      logger.debug(`Post-capture: cluster ${clusterId} may need splitting ` +
        `(d_bar=${decision.dBar.toFixed(4)}, d_eff=${decision.dEff.toFixed(2)})`);
    }
  } catch (err) {
    // Non-blocking: never fail the memory write
    logger.debug('evaluateAndConsolidate error', err instanceof Error ? err : String(err));
  }
}

/**
 * Auto-assign a memory to the global Inbox place by default.
 * Uses global project scope if no projectId provided.
 */
// Scope-aware place initialization cache keyed by global/project scope.
const _cachedPlaceInit = new Map<string, { inboxId: string }>();

async function ensurePlacesInitialized(projectId?: string | null): Promise<{ inboxId: string } | null> {
  const cacheKey = projectId ?? '__global__';
  const cached = _cachedPlaceInit.get(cacheKey);
  if (cached) {
    try {
      const { getPlace } = await import('../places/places.js');
      const existing = await getPlace(cached.inboxId);
      if (existing) return cached;
      _cachedPlaceInit.delete(cacheKey);
    } catch {
      _cachedPlaceInit.delete(cacheKey);
    }
  }
  try {
    const { initializeDefaultPlaces } = await import('../places/places.js');
    const places = await initializeDefaultPlaces(projectId ?? undefined);
    const inboxPlace = places.find(p => p.placeType === 'inbox');
    if (!inboxPlace) return null;
    const init = { inboxId: inboxPlace.id };
    _cachedPlaceInit.set(cacheKey, init);
    return init;
  } catch {
    return null;
  }
}

async function assignMemoryToDefaultPlace(memoryId: string, projectId?: string | null, placeType?: string | null): Promise<void> {
  try {
    const init = await ensurePlacesInitialized(projectId);
    if (!init) return;

    const { getPlaceByType } = await import('../places/places.js');
    const { assignMemoryToPlace } = await import('../places/memory-places.js');
    const { ensureGlobalProject } = await import('../places/places.js');

    let targetPlaceId = init.inboxId;
    const resolvedPlaceProjectId = projectId ?? (await ensureGlobalProject()).id;

    // If placeType specified, find that place instead of defaulting to Inbox
    if (placeType) {
      const place = await getPlaceByType(resolvedPlaceProjectId, placeType as any);
      if (place) {
        targetPlaceId = place.id;
      }
    }

    await assignMemoryToPlace({
      memoryId,
      placeId: targetPlaceId,
      isManual: false,
    });
  } catch (err) {
    // Non-blocking: never fail the memory write
    logger.debug(`assignMemoryToDefaultPlace error: ${err}`);
  }
}
