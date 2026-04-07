/**
 * QMD Hybrid Search Integration
 *
 * Integrates QMD's BM25+vector+rerank pipeline with Squish memories.
 * Provides enhanced search capabilities when QMD is available.
 *
 * QMD Search Pipeline:
 * 1. Query Expansion (LLM generates alternative queries)
 * 2. Parallel BM25 (FTS5) + Vector Search
 * 3. RRF Fusion (Reciprocal Rank Fusion)
 * 4. LLM Re-ranking (yes/no with logprobs)
 * 5. Position-Aware Blending
 *
 * Installation: bun install -g qmd
 * GitHub: https://github.com/tobi/qmd
 */

import { getQMDClient, QMDSearchResult } from '../embeddings/qmd-client.js';
import type { SearchInput, SearchResult } from '../memory/memories.js';
import { search } from '../memory/memories.js';
import { logger } from '../logger.js';
import { config } from '../../config.js';

export interface QMDSearchOptions extends SearchInput {
  useHybrid?: boolean; // Use qmd_query (true) or qmd_search/qmd_vsearch
  collection?: string; // Override default collection mapping
  includeSquishResults?: boolean; // Also search Squish database
}

export interface QMDHybridSearchResult extends SearchResult {
  qmdScore?: number; // Original QMD score
  source: 'squish' | 'qmd' | 'hybrid';
}

/**
 * Search memories using QMD's hybrid search
 *
 * @param options - Search options including query, type, limit, etc.
 * @returns QMD-enhanced search results
 */
export async function searchWithQMD(
  options: QMDSearchOptions
): Promise<QMDHybridSearchResult[]> {
  const client = await getQMDClient();

  if (!(await client.isAvailable())) {
    logger.warn('QMD unavailable, falling back to Squish search');
    // Fallback to Squish search
    const squishResults = await search(options);
    return squishResults.map((r): QMDHybridSearchResult => ({
      ...r,
      source: 'squish'
    }));
  }

  // Determine collection based on memory type mapping
  const collection = options.collection || getCollectionForType(options.type);

  try {
    let qmdResults: QMDSearchResult[] = [];

    if (options.useHybrid !== false) {
      // Use qmd_query (hybrid with reranking) - best quality
      qmdResults = await client.query({
        query: options.query,
        collection,
        limit: options.limit || 10,
        minScore: 0.2
      });
    } else {
      // Use qmd_vsearch (semantic only) - faster
      qmdResults = await client.vsearch({
        query: options.query,
        collection,
        limit: options.limit || 10,
        minScore: 0.2
      });
    }

    // Map QMD results to Squish format
    return qmdResults.map((result): QMDHybridSearchResult => ({
      id: result.docid || result.path,
      content: result.snippet || result.title,
      type: options.type || 'observation',
      tags: [],
      projectId: options.project ? options.project : null,
      similarity: result.score,
      qmdScore: result.score,
      source: 'qmd',
      createdAt: new Date().toISOString() // QMD doesn't provide timestamps
    }));
  } catch (error) {
    logger.error(`QMD search failed: ${error}`);
    // Fallback to Squish search
    const squishResults = await search(options);
    return squishResults.map((r): QMDHybridSearchResult => ({
      ...r,
      source: 'squish'
    }));
  }
}

/**
 * Fused search: combine Squish and QMD results
 *
 * Runs both searches in parallel and merges results with deduplication.
 *
 * @param options - Search options
 * @returns Fused search results from both sources
 */
export async function fusedSearch(
  options: QMDSearchOptions
): Promise<QMDHybridSearchResult[]> {
  const client = await getQMDClient();
  const qmdAvailable = await client.isAvailable();

  // Run searches in parallel
  const results = await Promise.allSettled([
    search(options),
    qmdAvailable ? searchWithQMD({ ...options, includeSquishResults: false }) : []
  ]);

  const squishResults = results[0].status === 'fulfilled'
    ? results[0].value.map((r): QMDHybridSearchResult => ({ ...r, source: 'squish' as const }))
    : [];

  const qmdResults = results[1].status === 'fulfilled'
    ? results[1].value
    : [];

  // Deduplicate by content similarity
  const seenContent = new Set<string>();
  const merged: QMDHybridSearchResult[] = [];

  for (const result of [...squishResults, ...qmdResults]) {
    // Create a content key for deduplication (first 100 chars)
    const contentKey = result.content.substring(0, 100);
    if (!seenContent.has(contentKey)) {
      seenContent.add(contentKey);
      merged.push(result);
    }
  }

  // Re-rank by combined score
  merged.sort((a, b) => {
    const scoreA = (a.similarity || 0) + (a.qmdScore || 0) / 2;
    const scoreB = (b.similarity || 0) + (b.qmdScore || 0) / 2;
    return scoreB - scoreA;
  });

  return merged.slice(0, options.limit || 10);
}

/**
 * Get QMD collection name for a memory type
 *
 * Uses the configured collection mapping from config.
 *
 * @param type - Memory type (observation, fact, decision, context, preference)
 * @returns QMD collection name
 */
function getCollectionForType(type?: string): string {
  if (!type) {
    return 'squish-all';
  }

  const mapping = config.qmdCollectionMapping || {} as Record<string, string>;
  return mapping[type] || `squish-${type}`;
}

/**
 * Check if QMD is available and configured
 *
 * @returns true if QMD is enabled and available
 */
export async function isQMDAvailable(): Promise<boolean> {
  if (!config.qmdEnabled) {
    return false;
  }

  try {
    const client = await getQMDClient();
    return await client.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Get QMD status and collection info
 *
 * @returns QMD status or null if unavailable
 */
export async function getQMDStatus(): Promise<{
  available: boolean;
  collections: Array<{ name: string; documentCount: number }>;
} | null> {
  try {
    const client = await getQMDClient();
    const available = await client.isAvailable();

    if (!available) {
      return { available: false, collections: [] };
    }

    const status = await client.status();
    return {
      available: true,
      collections: status?.collections || []
    };
  } catch {
    return null;
  }
}
