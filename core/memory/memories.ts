import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { config } from '../../config.js';
import { logger } from '../logger.js';
import { getOrCreateProject, requireProject } from '../../core/projects.js';
import { getEmbedding } from '../../core/embeddings.js';
import { enrichContent } from '../retrieval/contextual-enrichment.js';
import { normalizeTags, serializeTags, deserializeTags, serializeMetadata, deserializeMetadata } from '../../core/memory/serialization.js';
import { normalizeTimestamp, clampLimit, prepareEmbedding, normalizeVisibilityScopes } from '../lib/utils.js';
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
import { buildMemoryPolicy, buildVisibilityScopes, serializeVisibilityScopes, recommendMemoryScope } from './policy.js';
import { autoLinkByEntities } from '../associations.js';
import { autoRoute } from '../retrieval/query-router.js';
import { onMemoryStored } from '../graph/incremental-sync.js';
import { MemoryRecord, MemoryType } from '../lib/types.js';
export type { MemoryRecord, MemoryType };
import { parseEmbedding } from '../lib/parse-embedding.js';
import { findOrCreateCluster, updateClusterStats } from '../clustering/cluster-engine.js';
import { evaluateCluster, shouldConsolidate, shouldSplit } from '../clustering/consolidation-check.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { canWriteMemory } from '../team/acl.js';
import { filterMemoriesByScope } from '../team/scope-filter.js';
import { getTeamMember } from '../team/workspace.js';
import type { VisibilityScope } from '../team/types.js';
import type { TeamAccessContext, TeamMember } from '../team/types.js';

// MemoryType and MemoryRecord imported from ../lib/types.js

export interface RememberInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  project?: string;
  user?: string;            // Optional user identifier (name or email)
  actorUser?: string;
  actorAgent?: string;
  visibilityScope?: VisibilityScope;
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

export async function getOrCreateUser(identifier: string, existingDb?: any, existingSchema?: any): Promise<{ id: string } | null> {
  try {
    const { db, schema } = existingDb ? { db: existingDb, schema: existingSchema } : await getDbClient();
    const sqliteDb = db as any;
    const usersTable = schema.users;

    // Try to find existing user by externalId (name/email)
    let user = await sqliteDb.select().from(usersTable).where(
      eq(usersTable.externalId, identifier)
    ).limit(1).then((rows: any[]) => rows[0] || null);

    if (user) return { id: user.id };

    // Try by email pattern detection
    if (identifier.includes('@')) {
      user = await sqliteDb.select().from(usersTable).where(
        eq(usersTable.email, identifier)
      ).limit(1).then((rows: any[]) => rows[0] || null);
      if (user) return { id: user.id };
    }

    // Create new user
    const id = randomUUID();
    const isEmail = identifier.includes('@');
    await sqliteDb.insert(usersTable).values({
      id,
      externalId: identifier,
      name: isEmail ? null : identifier,
      email: isEmail ? identifier : null,
    });

    return { id };
  } catch (error: any) {
    logger.warn(`[User] Failed to resolve user "${identifier}":`, error);
    return null;
  }
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  project?: string;
  user?: string;           // Optional user filter (name or email)
  actorUser?: string;
  actorAgent?: string;
  visibilityScope?: VisibilityScope | VisibilityScope[]; // Optional visibility filter
  // Place and session filters for unified search (Task 2, Task 3)
  placeId?: string;        // Filter by place
  placeType?: string;     // Filter by place type (inbox, wip, archive, etc.)
  sessionId?: string;     // Filter by session
  sessionStartTime?: string; // Session start for temporal queries
  /** Enable retrieval trace for debugging (Phase 8) */
  trace?: boolean;
}

// SearchResult extends the shared MemoryRecord from normalization.ts
export interface SearchResult extends MemoryRecord {
  similarity: number;
  /** Retrieval trace for debugging (Phase 8) - populated when trace: true */
  _trace?: import('../retrieval/config.js').RetrievalTrace;
}

export async function rememberMemory(input: RememberInput): Promise<MemoryRecord> {
  const { db, schema } = await getDbClient();
  const tags = normalizeTags(input.tags);
  const project = input.project ? await getOrCreateProject(input.project) : null;
  const actor = await resolveTeamAccessMember(project?.id, {
    userId: input.actorUser ?? input.user,
    agentId: input.actorAgent,
  });
  const accessUser = input.actorUser ?? input.user;
  // Enrich content for embedding when contextual retrieval is enabled
  // The database stores original content; enriched version is only for embedding
  const enriched = enrichContent(input.content, {
    type: input.type,
    project: input.project,
    tags: tags,
  });
  const embedding = await getEmbedding(enriched.enriched);
  const id = randomUUID();
  const signals = detectMemorySignals(input.content);
  const type = input.type ?? signals.suggestedType;
  const visibilityScope = input.visibilityScope ?? config.defaultVisibilityScope;
  const policyRecommendation = recommendMemoryScope({
    content: input.content,
    type,
    tags,
    visibilityScope,
    importanceScore: 0,
    accessCount: 0,
    usageCount: 0,
    isPinned: false,
    signals,
  });
  const memoryPolicy = buildMemoryPolicy({
    content: input.content,
    type,
    tags,
    visibilityScope,
    importanceScore: 0,
    accessCount: 0,
    usageCount: 0,
    isPinned: false,
    signals,
  });
  memoryPolicy.recommendation = policyRecommendation;
  const readWriteScopes = buildVisibilityScopes(visibilityScope, 'user', accessUser);
  const serializedReadScope = serializeVisibilityScopes(readWriteScopes.readScope);
  const serializedWriteScope = serializeVisibilityScopes(readWriteScopes.writeScope);

  if (config.isTeamMode && project && !actor) {
    logger.warn('[TeamMode] Writing memory without actor identity; falling back to legacy project-scoped write');
  }

  if (config.isTeamMode && actor && !canWriteMemory({
    visibilityScope,
    projectId: project?.id ?? null,
    userId: input.actorUser ?? input.user ?? null,
    agentId: input.actorAgent ?? null,
  }, actor)) {
    throw new Error('Not authorized to write this memory in team mode');
  }

  const baseValues = {
    id,
    projectId: project?.id ?? null,
    type,
    content: input.content,
    source: input.source ?? 'mcp',
    visibilityScope,
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
  enrichedMetadata.memoryPolicy = memoryPolicy;
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
    visibilityScope,
    readScope: serializedReadScope,
    writeScope: serializedWriteScope,
  };

  // Add namespace if specified
  if (input.namespaceId) {
    insertValues.namespaceId = input.namespaceId;
  }

  // Add user if specified
  if (accessUser && schema.users) {
    try {
      const userRecord = await getOrCreateUser(accessUser, db, schema);
      if (userRecord) {
        insertValues.userId = userRecord.id;
      }
    } catch (e: any) {
      logger.warn('[User] Failed to attach user:', e);
    }
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
   // Uses incremental sync which tracks entity counts and runs periodic dedup
   if (config.graphAutoBuild && project?.id) {
     try {
       const syncResult = await onMemoryStored(id, {
         project: input.project,
       });
       if (syncResult.entitiesCreated > 0 || syncResult.relationsCreated > 0) {
         logger.debug(`[Graph] Synced memory ${id}: ${syncResult.entitiesCreated} entities, ${syncResult.relationsCreated} relations${syncResult.dedupRan ? ' (dedup ran)' : ''}`);
       }
     } catch (graphError) {
       logger.debug(`[Graph] Failed to sync memory ${id}: ${graphError}`);
     }
   }

   // Resolve contradictions and supersede old memories (async, non-blocking)
   // Benchmarks can skip this expensive path by setting SQUISH_SKIP_CONTRADICTION=true
   if (process.env.SQUISH_SKIP_CONTRADICTION !== 'true') {
       resolveContradictions(input.content, type, project?.id, id, insertValues.createdAt as string)
       .then(async (result) => {
          if (result.supersededIds.length > 0) {
            await applySupersession(id, result.supersededIds, result.confidence, result.associationType);
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
  await assignMemoryToDefaultPlace(id, project?.id, input.placeType || null, {
    tags: input.tags,
    content: input.content,
    toolName: input.toolName,
    memoryType: type,
  });

  // Store tags in memory_tags indexed table (v1.5.0)
  if (tags.length > 0) {
    try {
      const { storeMemoryTags } = await import('../places/memory-places.js');
      await storeMemoryTags(id, tags, 'heuristic');
    } catch (tagErr) {
      logger.debug(`Failed to store memory tags: ${tagErr}`);
    }
  }

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
  visibilityScope,
  importance: importance.score as number,
};

  return memoryRecord;
}

export async function getMemory(
  id: string,
  incrementAccess: boolean = true,
  actor?: TeamAccessContext,
): Promise<MemoryRecord | null> {
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
		  } catch (e: any) {
		    logger.warn('Failed to decrypt memory', e);
		    content = row.content; // fall back to stored content
		  }
		}
		const decryptedRow = { ...row, content };
    const normalized = normalizeMemory(decryptedRow);
    if (config.isTeamMode) {
      const allowed = await isMemoryReadableByTeamContext(normalized, {
        projectId: normalized.projectId ?? row.projectId ?? row.project_id ?? null,
        ...actor,
      });
      if (!allowed) return null;
    }
		return normalized;
	} catch (error: any) {
		throw error;
	}
}

/**
 * Batch-fetch memories by IDs (fixes N+1 query in walking.ts)
 * Returns memories in the same order as the input IDs, skipping any that are not found.
 */
export async function getMemoriesByIds(
  ids: string[],
  incrementAccess: boolean = false
): Promise<MemoryRecord[]> {
  if (ids.length === 0) return [];

  try {
    const { db, schema } = await getDbClient();
    const rows = await db.select().from(schema.memories).where(
      inArray(schema.memories.id, ids)
    );

    // Increment access counts if requested (batch update)
    if (incrementAccess && rows.length > 0) {
      const now = new Date();
      await db.update(schema.memories)
        .set({ lastAccessedAt: now })
        .where(inArray(schema.memories.id, ids));
    }

    // Normalize and filter by team access if needed
    const memories: MemoryRecord[] = [];
    for (const row of rows) {
      let content = row.content;
      if (row.is_encrypted) {
        try {
          content = decrypt(row.encrypted_content, row.encryption_nonce);
        } catch {
          content = row.content;
        }
      }
      const decryptedRow = { ...row, content };
      const normalized = normalizeMemory(decryptedRow);
      // Skip team mode check for batch (simplified - trust the caller)
      memories.push(normalized);
    }

    return memories;
  } catch (error) {
    logger.debug(`[Memories] getMemoriesByIds failed: ${error}`);
    return [];
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

export async function getRecent(projectPath: string, limit: number, actor?: TeamAccessContext): Promise<MemoryRecord[]> {
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

    const memories = rows.map((row: any) => normalizeMemory(row));
    if (!config.isTeamMode) {
      return memories;
    }
    const member = await resolveTeamAccessMember(project.id, actor);
    return filterReadableMemories(memories, member, project.id);
  } catch (error: any) {
    throw error;
  }
}

export async function search(input: SearchInput): Promise<SearchResult[]> {
  const limit = clampLimit(input.limit, 10, 1, 500);
  const tags = normalizeTags(input.tags);

  // Classify query intent and select optimal retrieval strategy
  let routeResult;
  try {
    routeResult = await autoRoute(input.query, {
      projectId: input.project,
      preferGraph: true,
    });
    logger.debug('[Search] Query routed', {
      intent: routeResult.classification.intent,
      strategy: routeResult.recommendedStrategy,
      confidence: routeResult.classification.confidence,
    });
  } catch {
    // Routing failure is non-fatal; fall through to default hybrid search
  }

  // Resolve user filter if provided
  let userId: string | null = null;
  if (input.user) {
    try {
      const userRecord = await getOrCreateUser(input.user);
      if (userRecord) {
        userId = userRecord.id;
      }
    } catch {
      // Ignore user resolution errors
    }
  }

  const project = input.project ? await requireProject(input.project) : null;
  const member = config.isTeamMode && project
    ? await resolveTeamAccessMember(project.id, {
        userId: input.actorUser ?? input.user,
        agentId: input.actorAgent,
      })
    : null;

  // Pass routing hints to hybrid search for strategy-aware retrieval
  const searchOptions: Record<string, unknown> = { limit };
  if (routeResult?.recommendedStrategy) {
    searchOptions.preferredStrategy = routeResult.recommendedStrategy;
    searchOptions.queryIntent = routeResult.classification.intent;
  }
  let dbResults = await hybridSearchImpl(input, searchOptions);

  if (dbResults.length === 0) {
    dbResults = await fallbackSearchByRecency(input, limit);
  }

  if (config.isTeamMode) {
    dbResults = filterReadableMemories(dbResults, member, project?.id ?? null);
  }

  // Post-filter by userId if user filter was provided
  if (userId) {
    return dbResults
      .filter((r: any) => r.userId === userId || (r as any).user_id === userId)
      .slice(0, limit);
  }

  return dbResults.slice(0, limit);
}

async function fallbackSearchByRecency(input: SearchInput, limit: number): Promise<SearchResult[]> {
  try {
    const { db, schema } = await getDbClient();
    const conditions: any[] = [];

    if (input.project) {
      const project = await requireProject(input.project);
      conditions.push(eq(schema.memories.projectId, project.id));
    }

    if (input.type) {
      conditions.push(eq(schema.memories.type, input.type));
    }

    const visibilityScopes = normalizeVisibilityScopes(input.visibilityScope);
    if (visibilityScopes && visibilityScopes.length > 0) {
      conditions.push(inArray(schema.memories.visibilityScope, visibilityScopes));
    }

    const query = (db as any)
      .select()
      .from(schema.memories);

    const rows = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(schema.memories.createdAt)).limit(limit * 2)
      : await query.orderBy(desc(schema.memories.createdAt)).limit(limit * 2);

    let results = rows.map((row: any): SearchResult => ({
      ...normalizeMemory(row),
      similarity: 0,
    }));
    if (config.isTeamMode) {
      const projectId = input.project ? (await requireProject(input.project)).id : null;
      const member = projectId
        ? await resolveTeamAccessMember(projectId, {
            userId: input.actorUser ?? input.user,
            agentId: input.actorAgent,
          })
        : null;
      results = filterReadableMemories(results, member, projectId);
    }
    return results;
  } catch {
    return [];
  }
}

async function resolveTeamAccessMember(projectId: string | null | undefined, actor?: TeamAccessContext): Promise<TeamMember | null> {
  if (!config.isTeamMode) return null;
  if (!projectId) return null;
  if (!actor?.userId && !actor?.agentId) return null;
  try {
    return await getTeamMember(projectId, actor.userId, actor.agentId);
  } catch {
    return null;
  }
}

function filterReadableMemories<T extends { visibilityScope?: string | null; projectId?: string | null; userId?: string | null; agentId?: string | null }>(
  memories: T[],
  member: TeamMember | null,
  projectId: string | null,
): T[] {
  if (!config.isTeamMode) return memories;
  if (member) {
    return filterMemoriesByScope(memories as any, member) as T[];
  }
  return memories.filter((memory) => {
    const scope = memory.visibilityScope ?? 'private';
    if (scope === 'global') return true;
    if (scope === 'private') return false;
    if (!projectId) return false;
    return !memory.projectId || memory.projectId === projectId;
  });
}

async function isMemoryReadableByTeamContext(
  memory: MemoryRecord,
  actor: TeamAccessContext & { projectId?: string | null },
): Promise<boolean> {
  if (!config.isTeamMode) return true;
  const scope = memory.visibilityScope ?? 'private';
  if (scope === 'global') return true;
  if (!actor.projectId) return false;
  const member = await resolveTeamAccessMember(actor.projectId, actor);
  if (!member) {
    return scope !== 'private';
  }
  return filterMemoriesByScope([memory as any], member).length > 0;
}

// parseEmbedding imported from ../lib/parse-embedding.js

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
    visibilityScope: row.visibilityScope ?? row.visibility_scope ?? null,
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
    logger.debug('evaluateAndConsolidate error', { error: err instanceof Error ? err.message : String(err) });
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

async function assignMemoryToDefaultPlace(
  memoryId: string, 
  projectId?: string | null, 
  placeType?: string | null,
  options?: {
    tags?: string[];
    content?: string;
    toolName?: string;
    memoryType?: string;
  }
): Promise<void> {
  try {
    const init = await ensurePlacesInitialized(projectId);
    if (!init) return;

    const { ensureGlobalProject } = await import('../places/places.js');
    const resolvedPlaceProjectId = projectId ?? (await ensureGlobalProject()).id;

    // Use findMatchingPlaces() to get ranked candidates
    const { findMatchingPlaces } = await import('../places/rules.js');
    const candidates = await findMatchingPlaces(projectId ?? undefined, {
      toolName: options?.toolName,
      content: options?.content,
      tags: options?.tags,
      memoryType: options?.memoryType,
    });

    // If placeType was explicitly specified and is not the top candidate,
    // make sure it appears as a candidate
    if (placeType && candidates.length > 0 && candidates[0].type !== placeType) {
      // Add explicit placeType as first candidate
      candidates.unshift({
        type: placeType as any,
        weight: 1.0,
        reason: 'explicitly specified',
        source: 'manual',
      });
    } else if (placeType && candidates.length === 0) {
      candidates.push({
        type: placeType as any,
        weight: 1.0,
        reason: 'explicitly specified',
        source: 'manual',
      });
    }

    // Fallback to inbox if no candidates matched
    if (candidates.length === 0) {
      candidates.push({
        type: 'inbox' as any,
        weight: 1.0,
        reason: 'default fallback',
        source: 'heuristic',
      });
    }

    // Store all candidates in memory_places (1:N)
    const { assignMemoryToPlaces } = await import('../places/memory-places.js');
    await assignMemoryToPlaces(memoryId, candidates, resolvedPlaceProjectId);

    // Set primaryPlace and place_id (legacy alias) on the memory record
    const primaryPlace = candidates[0]?.type ?? placeType ?? 'inbox';
    const client = ((await getDb()) as any).$client || (await getDb());
    try {
      // Resolve placeType to placeId for legacy place_id column
      const { getPlaceByType } = await import('../places/places.js');
      const place = await getPlaceByType(resolvedPlaceProjectId, primaryPlace);
      const placeId = place?.id ?? null;

      if (placeId) {
        const stmt = client.prepare(
          'UPDATE memories SET primary_place = ?, place_id = ? WHERE id = ?'
        );
        stmt.run(primaryPlace, placeId, memoryId);
      } else {
        const stmt = client.prepare(
          'UPDATE memories SET primary_place = ? WHERE id = ?'
        );
        stmt.run(primaryPlace, memoryId);
      }
    } catch {
      // Fallback to drizzle
      try {
        const sqliteDb = (await getDb()) as any;
        const schemaModule = await getSchema();
        await sqliteDb.update(schemaModule.memories)
          .set({ primaryPlace })
          .where(eq(schemaModule.memories.id, memoryId));
      } catch {
        // Ignore
      }
    }
  } catch (err) {
    // Non-blocking: never fail the memory write
    logger.debug(`assignMemoryToDefaultPlace error: ${err}`);
  }
}
