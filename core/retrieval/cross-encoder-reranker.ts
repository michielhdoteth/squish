/**
 * Cross-Encoder Reranker - Precision reranking for search results
 *
 * Uses cross-encoder models to jointly attend over query-document pairs
 * for more accurate relevance scoring than bi-encoder cosine similarity.
 *
 * Models:
 *   - cross-encoder/ms-marco-MiniLM-L-6-v2 (fast, English, ~80MB)
 *   - BAAI/bge-reranker-v2-m3 (multilingual, ~1.1GB)
 *   - cross-encoder/ms-marco-MiniLM-L-12-v2 (better accuracy, ~170MB)
 *
 * Usage:
 *   Set SQUISH_RERANKER_ENABLED=true
 *   Set SQUISH_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
 */

import { pipeline } from '@huggingface/transformers';
import { logger } from '../logger.js';
import { config } from '../../config.js';
import type { SearchResult } from '../memory/memories.js';

type Pipeline = Awaited<ReturnType<typeof pipeline>>;

export interface RerankerConfig {
  enabled: boolean;
  model: string;
  topK: number;           // How many candidates to rerank
  returnTopK: number;     // How many results to return after reranking
  device: 'cpu' | 'webgpu';
  dtype: 'q8' | 'q4' | 'f16' | 'f32';
}

export interface RerankedResult {
  id: string;
  originalScore: number;  // Original similarity score
  rerankScore: number;    // Cross-encoder relevance score
  finalScore: number;     // Blended final score
  content?: string;
  [key: string]: any;
}

// Singleton pipeline instance
let rerankerPipeline: Pipeline | null = null;
let isLoading = false;
let loadPromise: Promise<Pipeline | null> | null = null;

/**
 * Get reranker configuration from environment variables
 * Reads directly from process.env for testability
 */
export function getRerankerConfig(): RerankerConfig {
  return {
    enabled: process.env.SQUISH_RERANKER_ENABLED === 'true',
    model: process.env.SQUISH_RERANKER_MODEL || 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    topK: parseInt(process.env.SQUISH_RERANKER_TOP_K ?? '30', 10),
    returnTopK: parseInt(process.env.SQUISH_RERANKER_RETURN_TOP_K ?? '20', 10),
    device: 'cpu',
    dtype: 'q8',
  };
}

/**
 * Get or initialize the reranker pipeline (lazy loading)
 */
async function getPipeline(): Promise<Pipeline | null> {
  // Return existing pipeline
  if (rerankerPipeline) {
    return rerankerPipeline;
  }

  // Already loading - wait for it
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  const cfg = getRerankerConfig();

  if (!cfg.enabled) {
    isLoading = false;
    return null;
  }

  if (!cfg.model) {
    isLoading = false;
    throw new Error('Reranker requires SQUISH_RERANKER_MODEL to be set');
  }

  logger.info(`Loading cross-encoder reranker model: ${cfg.model}`);

  loadPromise = (async () => {
    try {
      rerankerPipeline = await pipeline(
        'text-classification',
        cfg.model as any,
        {
          device: cfg.device as any,
          dtype: cfg.dtype as any,
        }
      );

      logger.info(`Cross-encoder reranker loaded: ${cfg.model}`);
      return rerankerPipeline;
    } catch (error) {
      logger.error(`Failed to load reranker model: ${error}`);
      rerankerPipeline = null;
      throw error;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Check if reranker is ready
 */
export function isReady(): boolean {
  return rerankerPipeline !== null;
}

/**
 * Score a single query-document pair
 * Returns relevance score (higher = more relevant)
 */
export async function scorePair(
  query: string,
  document: string
): Promise<number | null> {
  try {
    const pipeline = await getPipeline();
    if (!pipeline) {
      return null;
    }

    // Truncate inputs to avoid token limit issues
    const truncatedQuery = query.slice(0, 512);
    const truncatedDoc = document.slice(0, 512);

    // Cross-encoder expects concatenated input: "[CLS] query [SEP] document [SEP]"
    const input = `${truncatedQuery} [SEP] ${truncatedDoc}`;

    const result = await (pipeline as any)(input, {
      topk: 1,
    });

    // Extract score from result
    if (Array.isArray(result) && result.length > 0) {
      const score = result[0];
      // Models typically output { label: 'LABEL_0', score: 0.99 }
      // For relevance, we want the positive class score
      return typeof score.score === 'number' ? score.score : 0.5;
    }

    return 0.5;
  } catch (error) {
    logger.warn(`Cross-encoder scoring error: ${error}`);
    return null;
  }
}

/**
 * Score multiple query-document pairs in batch
 * More efficient than calling scorePair multiple times
 */
export async function scoreBatch(
  query: string,
  documents: string[]
): Promise<(number | null)[]> {
  if (documents.length === 0) {
    return [];
  }

  try {
    const pipeline = await getPipeline();
    if (!pipeline) {
      return documents.map(() => null);
    }

    // Prepare batch inputs
    const truncatedQuery = query.slice(0, 512);
    const inputs = documents.map(doc => {
      const truncatedDoc = doc.slice(0, 512);
      return `${truncatedQuery} [SEP] ${truncatedDoc}`;
    });

    // Process batch
    const results = await (pipeline as any)(inputs, {
      topk: 1,
    });

    // Extract scores
    return Array.from(results).map(result => {
      if (Array.isArray(result) && result.length > 0) {
        const score = result[0];
        return typeof score.score === 'number' ? score.score : 0.5;
      }
      return 0.5;
    });
  } catch (error) {
    logger.warn(`Cross-encoder batch scoring error: ${error}`);
    return documents.map(() => null);
  }
}

/**
 * Rerank search results using cross-encoder
 *
 * @param query - The search query
 * @param results - Initial search results to rerank
 * @param options - Reranking options
 * @returns Reranked results with blended scores
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
  options: {
    topK?: number;
    returnTopK?: number;
    blendWeight?: number;  // Weight for cross-encoder score (0-1)
  } = {}
): Promise<SearchResult[]> {
  const cfg = getRerankerConfig();
  const topK = options.topK ?? cfg.topK;
  const returnTopK = options.returnTopK ?? cfg.returnTopK;
  const blendWeight = options.blendWeight ?? 0.7;  // 70% cross-encoder, 30% original

  if (!cfg.enabled) {
    // Preserve original scores even when reranker is disabled
    return results.slice(0, returnTopK).map(r => ({
      ...r,
      _originalScore: r.similarity ?? 0,
    }));
  }

  if (results.length === 0) {
    return [];
  }

  // Take top candidates for reranking
  const candidates = results.slice(0, topK);
  const remaining = results.slice(topK);

  logger.debug(`Reranking ${candidates.length} candidates (of ${results.length} total)`);

  // Score all candidates in batch
  const documents = candidates.map(r => r.content ?? '');
  const scores = await scoreBatch(query, documents);

  // Blend scores and create reranked results
  const reranked: SearchResult[] = candidates.map((result, i) => {
    const originalScore = result.similarity ?? 0;
    const rerankScore = scores[i] ?? 0.5;

    // Blend: weighted combination of original and rerank scores
    const finalScore = (blendWeight * rerankScore) + ((1 - blendWeight) * originalScore);

    return {
      ...result,
      similarity: finalScore,
      _rerankScore: rerankScore,
      _originalScore: originalScore,
    };
  });

  // Sort by final score
  reranked.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  // Return top results + any remaining (unreranked)
  return [...reranked.slice(0, returnTopK), ...remaining].slice(0, returnTopK);
}

/**
 * Check health of the reranker
 */
export async function checkHealth(): Promise<{
  available: boolean;
  latencyMs?: number;
  error?: string;
  model?: string;
}> {
  const cfg = getRerankerConfig();

  if (!cfg.enabled) {
    return {
      available: false,
      error: 'Reranker is disabled (SQUISH_RERANKER_ENABLED=false)',
    };
  }

  if (!cfg.model) {
    return {
      available: false,
      error: 'SQUISH_RERANKER_MODEL is not configured',
    };
  }

  // Check if library is available
  try {
    await import('@huggingface/transformers');
  } catch (error) {
    return {
      available: false,
      error: '@huggingface/transformers not installed',
    };
  }

  // Try quick scoring
  const start = Date.now();
  try {
    const score = await scorePair('test query', 'test document');
    const latency = Date.now() - start;

    return {
      available: score !== null,
      latencyMs: latency,
      model: cfg.model,
    };
  } catch (error) {
    return {
      available: false,
      error: (error as Error).message,
      model: cfg.model,
    };
  }
}

/**
 * Unload the pipeline (for testing or memory management)
 */
export async function unload(): Promise<void> {
  if (rerankerPipeline) {
    rerankerPipeline = null;
    logger.info('Cross-encoder reranker pipeline unloaded');
  }
}

/**
 * Warm up the model with a test input
 */
export async function warmup(): Promise<boolean> {
  try {
    const score = await scorePair('warmup test', 'warmup document');
    return score !== null;
  } catch {
    return false;
  }
}

export default {
  getRerankerConfig,
  isReady,
  scorePair,
  scoreBatch,
  rerankResults,
  checkHealth,
  unload,
  warmup,
};
