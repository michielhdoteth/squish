/**
 * Hybrid Search - Combines BM25 keyword search with vector semantic search
 * Uses Reciprocal Rank Fusion (RRF) for intelligent result merging
 *
 * Based on research showing 40-60% improvement over pure vector search:
 * - BM25 excels at exact keyword matches
 * - Vector search captures semantic similarity
 * - RRF merges both without score calibration issues
 */

import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../../core/database.js';
import { getEmbedding } from '../../core/embeddings.js';
import { getProjectByPath, ensureProject } from '../../core/projects.js';
import { fromSqliteTags, normalizeTags } from './serialization.js';
import { isDatabaseUnavailableError } from '../../core/utils.js';

/**
 * Reciprocal Rank Fusion (RRF) constant
 * Higher values = more influence from lower-ranked items
 * 60 is the standard value used in research
 */
const RRF_K = 60;

export interface HybridSearchOptions {
  limit?: number;
  project?: string;
  type?: string;
  tags?: string[];
  /** Weight for BM25 results (0-1), default 0.5 */
  bm25Weight?: number;
  /** Weight for vector results (0-1), default 0.5 */
  vectorWeight?: number;
}

interface RankedResult {
  id: string;
  rank: number;
  score: number;
  result: Omit<SearchResult, 'similarity'> & { similarity?: number };
}

/**
 * Main hybrid search function - combines BM25 and vector search with RRF
 */
export async function hybridSearch(
  input: SearchInput,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const limit = options.limit ?? input.limit ?? 10;
  const bm25Weight = options.bm25Weight ?? 0.5;
  const vectorWeight = options.vectorWeight ?? 0.5;

  // Run both searches in parallel
  const [bm25Results, vectorResults] = await Promise.all([
    bm25Search(input, { ...options, limit: limit * 2 }),
    vectorSearch(input, { ...options, limit: limit * 2 }),
  ]);

  // Apply RRF to merge results
  return reciprocalRankFusion(
    bm25Results,
    vectorResults,
    { limit, bm25Weight, vectorWeight }
  );
}

/**
 * BM25 keyword search using SQLite FTS5
 */
async function bm25Search(
  input: SearchInput,
  options: HybridSearchOptions
): Promise<RankedResult[]> {
  try {
    const db = createDatabaseClient(await getDb());
    const sqlite = db.$client as any;
    const limit = options.limit ?? 10;
    const tags = normalizeTags(options.tags ?? input.tags);

    // Build FTS5 query with proper escaping
    const ftsQuery = buildFtsQuery(input.query);
    const isEmptyQuery = ftsQuery === '*';

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    // For non-empty queries, use FTS5 MATCH
    if (!isEmptyQuery) {
      conditions.push('memories_fts MATCH ?');
      params.push(ftsQuery);
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
      const project = await getProjectByPath(input.project);
      if (project) {
        projectId = project.id;
        conditions.push('m.project_id = ?');
        params.push(project.id);
      }
    }

    // For empty query with no filters, use "1=1" to match all
    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    // Build query based on whether we have a search term or not
    const statement = sqlite.prepare(`
      SELECT
        m.id as id,
        m.project_id as projectId,
        m.type as type,
        m.content as content,
        m.summary as summary,
        m.tags as tags,
        m.metadata as metadata,
        ${isEmptyQuery ? '0 as bm25Score' : 'bm25(memories_fts) as bm25Score'},
        m.created_at as createdAt
      FROM memories m
      ${isEmptyQuery ? '' : 'INNER JOIN memories_fts ON m.rowid = memories_fts.rowid'}
      WHERE ${whereClause}
      ${isEmptyQuery ? 'ORDER BY m.created_at DESC' : 'ORDER BY bm25(memories_fts)'}
      LIMIT ?
    `);

    const rows = statement.all(...params, limit * 3) as Array<{
      id: string;
      projectId: string | null;
      type: string;
      content: string;
      summary: string | null;
      tags: string | null;
      metadata: string | null;
      bm25Score: number;
      createdAt: string | null;
    }>;

    // Return as ranked results (lower BM25 score = better rank)
    return rows.map((row, index) => ({
      id: row.id,
      rank: index + 1,
      score: row.bm25Score,
      result: {
        id: row.id,
        projectId: row.projectId,
        type: row.type as any,
        content: row.content,
        summary: row.summary ?? undefined,
        tags: fromSqliteTags(row.tags ?? null),
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        createdAt: row.createdAt ? new Date((Number(row.createdAt) || 0) * 1000).toISOString() : undefined,
      },
    }));
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Vector semantic search using cosine similarity
 */
async function vectorSearch(
  input: SearchInput,
  options: HybridSearchOptions
): Promise<RankedResult[]> {
  try {
    const db = createDatabaseClient(await getDb());
    const sqlite = db.$client as any;
    const limit = options.limit ?? 10;
    const tags = normalizeTags(options.tags ?? input.tags);

    // Check for empty query
    const isEmptyQuery = !input.query || input.query.trim() === '';

    // Get query embedding (only for non-empty queries)
    let queryEmbedding: number[] | null = null;
    if (!isEmptyQuery) {
      queryEmbedding = await getEmbedding(input.query);
      // If embedding fails but query is not empty, still proceed without semantic ranking
      // Fall back to recency-based ranking
    }

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

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
      const project = await getProjectByPath(input.project);
      if (project) {
        projectId = project.id;
        conditions.push('m.project_id = ?');
        params.push(project.id);
      }
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

    const rows = statement.all(...params, limit * 3) as Array<{
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
      return rows.slice(0, limit * 2).map((item, index) => ({
        id: item.id,
        rank: index + 1,
        score: 0, // No similarity score available
        result: {
          id: item.id,
          projectId: item.projectId,
          type: item.type as any,
          content: item.content,
          summary: item.summary ?? undefined,
          tags: fromSqliteTags(item.tags ?? null),
          metadata: item.metadata ? JSON.parse(item.metadata) : null,
          createdAt: item.createdAt ? new Date((Number(item.createdAt) || 0) * 1000).toISOString() : undefined,
          similarity: 0,
        },
      }));
    }

    // Calculate cosine similarity for each result
    const scored = rows
      .map((row) => {
        const embedding = parseEmbedding(row.embedding) ?? parseEmbedding(row.embeddingJson);
        if (!embedding) return null;

        const similarity = cosineSimilarity(queryEmbedding, embedding);
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

    // Sort by similarity (descending) and return as ranked results
    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, limit * 2).map((item, index) => ({
      id: item.id,
      rank: index + 1,
      score: item.similarity,
      result: {
        id: item.id,
        projectId: item.projectId,
        type: item.type as any,
        content: item.content,
        summary: item.summary ?? undefined,
        tags: fromSqliteTags(item.tags ?? null),
        metadata: item.metadata ? JSON.parse(item.metadata) : null,
        createdAt: item.createdAt ? new Date((Number(item.createdAt) || 0) * 1000).toISOString() : undefined,
        similarity: item.similarity,
      },
    }));
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Reciprocal Rank Fusion (RRF) - merges ranked lists without score calibration
 *
 * RRF Formula: score(item) = sum(weight_i / (k + rank_i))
 * Where k is a constant (typically 60) that prevents high ranks from dominating
 *
 * Benefits:
 * - No need to calibrate different scoring systems (BM25 vs cosine similarity)
 * - Handles items that appear in only one list
 * - Proven to outperform weighted score fusion in most cases
 */
function reciprocalRankFusion(
  bm25Results: RankedResult[],
  vectorResults: RankedResult[],
  options: { limit: number; bm25Weight: number; vectorWeight: number }
): SearchResult[] {
  const { limit, bm25Weight, vectorWeight } = options;
  const scores = new Map<string, { score: number; result: RankedResult['result'] }>();

  // Process BM25 results
  for (const item of bm25Results) {
    const rrfScore = (bm25Weight * 2) / (RRF_K + item.rank);
    const existing = scores.get(item.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(item.id, { score: rrfScore, result: item.result });
    }
  }

  // Process vector results
  for (const item of vectorResults) {
    const rrfScore = (vectorWeight * 2) / (RRF_K + item.rank);
    const existing = scores.get(item.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(item.id, { score: rrfScore, result: item.result });
    }
  }

  // Sort by RRF score (descending) and return top results
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      ...item.result,
      similarity: item.result.similarity ?? 0,
    }));
}

/**
 * Build FTS5 query string from user input
 * Handles phrase searches, OR operators for better recall, and special characters
 */
function buildFtsQuery(query: unknown): string {
  // Ensure query is a string
  const queryString = typeof query === 'string' ? query : String(query ?? '');

  // Remove special characters that could break FTS5 syntax
  let cleaned = queryString.replace(/[^\w\s"'-]/g, ' ');

  // If query contains quotes, preserve as phrase search
  if (cleaned.includes('"')) {
    return cleaned || '*'; // Return * for empty after cleaning
  }

  // Split into terms
  const terms = cleaned.trim().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) {
    return '*'; // Match all for empty query
  }

  // For multi-word queries, use OR for better recall (any term matches)
  // This is less restrictive than AND and finds more relevant results
  if (terms.length > 1) {
    return terms.join(' OR ');
  }

  return terms[0];
}

/**
 * Parse embedding from SQLite storage
 */
function parseEmbedding(embeddingData: any): number[] | null {
  if (!embeddingData) return null;

  if (Array.isArray(embeddingData)) return embeddingData;

  if (embeddingData instanceof Uint8Array || Buffer.isBuffer(embeddingData)) {
    try {
      const json = JSON.parse(embeddingData.toString());
      if (Array.isArray(json)) return json;
    } catch {
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
