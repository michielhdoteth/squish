/**
 * Memory search and similarity operations.
 *
 * Provides the main search entry-point, fallback recency search, and
 * duplicate-detection helper (findSimilarMemories).
 */

import { and, desc, eq } from 'drizzle-orm';
import { requireProject } from '../../core/projects.js';
import { logger } from '../logger.js';
import { normalizeTags } from '../../core/memory/serialization.js';
import { clampLimit } from '../lib/utils.js';
import { getDbClient } from '../lib/db-client.js';
import { hybridSearch as hybridSearchImpl } from './hybrid-search.js';
import { autoRoute } from '../retrieval/query-router.js';
import { normalizeMemory, getOrCreateUser } from './memory-crud.js';
import type { SearchInput, SearchResult } from './memory-types.js';

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

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

  // Post-filter by userId if user filter was provided
  if (userId) {
    return dbResults
      .filter((r: any) => r.userId === userId || (r as any).user_id === userId)
      .slice(0, limit);
  }

  return dbResults.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    return results;
  } catch {
    return [];
  }
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
