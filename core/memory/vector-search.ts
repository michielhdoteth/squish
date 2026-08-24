/**
 * Vector Search - Pure semantic search with cosine similarity on embeddings
 */

import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../storage/database.js';
import { getEmbedding } from '../../core/embeddings.js';
import { requireProject } from '../../core/projects.js';
import { deserializeTags, deserializeMetadata, normalizeTags } from './serialization.js';
import { normalizeTimestamp } from '../lib/utils.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { logger } from '../logger.js';

/**
 * Cached DB context for a single search operation.
 * Avoids redundant getDb()/createDatabaseClient() calls across
 * vectorSearch, keywordSearch, and helper functions.
 */
export interface SearchDbContext {
  dbClient: ReturnType<typeof createDatabaseClient>;
  /** Raw drizzle DB instance for direct query builder usage */
  db: Awaited<ReturnType<typeof getDb>>;
}

type HybridSearchOptions = {
  limit?: number;
  project?: string;
  type?: string;
  tags?: string[];
};

function rowToSearchResult(row: any, similarity: number): SearchResult {
  // created_at is stored as an epoch number (seconds); a bare numeric string
  // must be coerced back to a number or downstream Date parsing yields NaN.
  const rawCreated = typeof row.createdAt === 'string' && /^\d+$/.test(row.createdAt)
    ? Number(row.createdAt)
    : row.createdAt;
  return {
    id: row.id,
    content: row.content || '',
    type: row.type || 'note',
    similarity,
    // Batch 3: on the raw vector leg, similarity IS the honest cosine.
    semanticScore: similarity,
    boostScore: 0,
    finalScore: Math.max(0, Math.min(1, similarity)),
    scoreBreakdown: {},
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : (normalizeTimestamp(rawCreated) ?? String(row.createdAt || '')),
    tags: row.tags || [],
  };
}

export async function vectorSearch(
  input: SearchInput,
  options: HybridSearchOptions,
  precomputedEmbedding?: number[] | null,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  const dbClient = ctx?.dbClient ?? createDatabaseClient(await getDb());
  const sqlite = dbClient.$client as any;
  const limit = options.limit ?? 10;
  const tags = normalizeTags(options.tags ?? input.tags);

  // Check for empty query
  const isEmptyQuery = !input.query || input.query.trim() === '';

  // Use pre-computed embedding if provided, otherwise compute it
  let queryEmbedding: number[] | null = null;
  if (precomputedEmbedding !== undefined) {
    queryEmbedding = precomputedEmbedding;
  } else if (!isEmptyQuery) {
    queryEmbedding = await getEmbedding(input.query);
  }

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];

  // Batch 2 candidate correctness: expired/archived memories never become
  // candidates. 'superseded'/'merged' intentionally stay - the scoring layer
  // (applySupersessionFilter) owns filter/penalty behavior for those.
  conditions.push("(m.status IS NULL OR m.status NOT IN ('expired', 'archived'))");

  // Consolidated source rows (isConsolidated = 1) are excluded unless the
  // caller explicitly opts in. Consolidated summaries themselves are normal
  // memories and remain retrievable.
  if (!input.includeConsolidatedSources) {
    conditions.push('(m.is_consolidated IS NULL OR m.is_consolidated = 0)');
  }

  if (input.type) {
    conditions.push('m.type = ?');
    params.push(input.type);
  }

  if (tags.length) {
    conditions.push('(' + tags.map(() => 'm.tags LIKE ?').join(' OR ') + ')');
    params.push(...tags.map((tag) => `%${tag}%`));
  }

  let projectId: string | null = null;
  if (input.project) {
    const project = await requireProject(input.project);
    projectId = project.id;
    conditions.push('m.project_id = ?');
    params.push(project.id);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  // Fetch candidates for vector search
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

  const rows = statement.all(...params, Math.max(limit * 20, 200)) as Array<{
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

  // If no embedding available, return results ordered by recency
  if (!queryEmbedding) {
    return rows.slice(0, limit * 2).map((item) => rowToSearchResult(item, 0));
  }

  // Calculate cosine similarity for each result
  const scored = rows
    .map((row) => {
      const embedding = parseEmbedding(row.embedding) ?? parseEmbedding(row.embeddingJson);
      if (!embedding) return null;

      const similarity = cosineSimilarity(queryEmbedding!, embedding);
      return {
        id: row.id,
        projectId: row.projectId,
        type: row.type,
        content: row.content,
        summary: row.summary,
        tags: row.tags,
        metadata: row.metadata,
        createdAt: row.createdAt,
        similarity,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Sort by similarity (descending) and return
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, limit * 2).map((item) => rowToSearchResult(item, item.similarity));
}
