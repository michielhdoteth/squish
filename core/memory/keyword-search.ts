/**
 * FTS5 Keyword Search - SQLite FTS5-based keyword retrieval
 * + Reciprocal Rank Fusion (RRF) for combining vector and keyword signals
 */

import type { SearchResult, SearchInput } from './memories.js';
import { getDb } from '../../db/index.js';
import { createDatabaseClient } from '../storage/database.js';
import { requireProject } from '../../core/projects.js';
import { deserializeTags, deserializeMetadata } from './serialization.js';
import { normalizeTimestamp } from '../lib/utils.js';
import { logger } from '../logger.js';
import type { SearchDbContext } from './vector-search.js';

/**
 * FTS5 keyword search using SQLite's built-in FTS5.
 * Squish already has memories_fts table - this connects it to hybrid search.
 * Provides keyword-based retrieval as a second signal alongside vector similarity.
 */
export async function keywordSearch(
  input: SearchInput,
  limit: number,
  ctx?: SearchDbContext
): Promise<SearchResult[]> {
  try {
    const dbClient = ctx?.dbClient ?? createDatabaseClient(await getDb());
    const sqlite = dbClient.$client as any;

    // FTS5 reserved words that must not appear as bare terms in the query
    const FTS5_RESERVED = new Set(['AND', 'OR', 'NOT', 'NEAR', 'COLUMN', 'RANK', 'CONTENT', 'ID', 'ROWID']);

    // Sanitize query for FTS5: remove special chars, keep meaningful words
    const ftsQuery = (input.query || '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !FTS5_RESERVED.has(w.toUpperCase()))
      .map(w => `"${w}"`)
      .join(' OR ');

    if (!ftsQuery) return [];

    const conditions: string[] = ['memories_fts MATCH ?'];
    const params: any[] = [ftsQuery];

    if (input.project) {
      const project = await requireProject(input.project);
      conditions.push('m.project_id = ?');
      params.push(project.id);
    }

    if (input.type) {
      conditions.push('m.type = ?');
      params.push(input.type);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const query = `
      SELECT
        m.id as id,
        m.project_id as projectId,
        m.type as type,
        m.content as content,
        m.summary as summary,
        m.tags as tags,
        m.metadata as metadata,
        m.created_at as createdAt,
        rank as similarity
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      ${whereClause}
      ORDER BY rank
      LIMIT ?
    `;

    const rows = sqlite.prepare(query).all(...params, limit) as Array<{
      id: string;
      projectId: string | null;
      type: string;
      content: string;
      summary: string | null;
      tags: string | null;
      metadata: string | null;
      createdAt: string | null;
      similarity: number;
    }>;

    return rows.map(item => ({
      id: item.id,
      projectId: item.projectId,
      type: item.type as any,
      content: item.content,
      summary: item.summary ?? undefined,
      tags: deserializeTags(item.tags ?? null),
      metadata: deserializeMetadata(item.metadata ?? null),
      createdAt: item.createdAt ? (normalizeTimestamp(Number(item.createdAt)) ?? undefined) : undefined,
      similarity: -item.similarity, // FTS5 rank is negative (lower = better), negate for consistency
    }));
  } catch (error: any) {
    // FTS5 may fail if no content table or malformed query
    logger.debug(`[FTS5] Keyword search failed: ${error.message}`);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion (RRF) for combining multiple search signals.
 * Fuses vector similarity results with FTS5 keyword results.
 * This is the industry standard approach (Mem0, TrueMemory, etc.).
 */
export function rrfFusion(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  limit: number,
  k: number = 60
): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>();

  // Add vector results with RRF score
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1.0 / (k + rank);
    scores.set(result.id, { result, score: rrfScore });
  });

  // Add keyword results with RRF score (fused)
  keywordResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1.0 / (k + rank);
    const existing = scores.get(result.id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(result.id, { result, score: rrfScore });
    }
  });

  // Sort by fused RRF score descending
  const fused = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Normalize similarity to [0, 1] for consistency with existing pipeline
  const maxScore = fused.length > 0 ? fused[0].score : 1;
  return fused.map(item => ({
    ...item.result,
    similarity: maxScore > 0 ? item.score / maxScore : 0,
  }));
}
