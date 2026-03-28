import { hybridScore, HybridScorerOptions } from './hybrid-scorer.js';
import { getEmbedding } from '../embeddings.js';
import { search, SearchInput, MemoryRecord } from './memories.js';
import { filterByEntities } from './entity-resolver.js';
import { rewriteQuery, wouldBenefitFromRewrite } from './query-rewriter.js';
import { collectRecentContext } from './context-collector.js';
import { config } from '../../config.js';
import { logger } from '../logger.js';
import {
  startTrace,
  addQueryRewriteStage,
  addCandidateRetrievalStage,
  addEntityFilteringStage,
  addHybridScoringStage,
  addRerankingStage,
  completeTrace,
} from '../tracing/collector.js';

export interface HybridSearchOptions extends SearchInput {
  candidateLimit?: number;
  resultLimit?: number;
  hybridOptions?: HybridScorerOptions;
  queryEntities?: string[];
  sessionId?: string;
  skipRewrite?: boolean;
}

export interface HybridSearchResult extends MemoryRecord {
  hybridScore: number;
  semanticScore: number;
  recencyScore: number;
  coactivationScore: number;
  importanceScore: number;
  confidenceScore: number;
  feedbackScore: number;
  entityBoost: number;
  rank: number;
  queryRewrite?: { original: string; rewritten: string; method: string };
}

export function applyEntityBoostAndRerank(scored: Awaited<ReturnType<typeof hybridScore>>): Awaited<ReturnType<typeof hybridScore>> {
  const boosted = scored.map((item) => {
    const rawBoost = (item.memory as any)._entityBoost;
    const entityBoost = typeof rawBoost === 'number' ? rawBoost : 0.5;
    const multiplier = 0.8 + entityBoost * 0.4;
    return {
      ...item,
      totalScore: Math.min(100, Math.round(item.totalScore * multiplier * 100) / 100),
    };
  });

  boosted.sort((a, b) => b.totalScore - a.totalScore);
  for (let i = 0; i < boosted.length; i++) {
    boosted[i].rank = i + 1;
  }

  return boosted;
}

export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const candidateLimit = options.candidateLimit ?? 50;
  const resultLimit = options.resultLimit ?? options.limit ?? 5;

  // Start trace if sessionId provided
  const sessionId = options.sessionId || 'unknown';
  const traceId = await startTrace(sessionId, options.query);

  let query = options.query;
  let rewriteInfo: { original: string; rewritten: string; method: string } | null = null;

  // Query rewriting stage
  if (config.queryRewritingEnabled && !options.skipRewrite && options.sessionId) {
    const rewriteStart = Date.now();
    try {
      const context = await collectRecentContext(options.sessionId, config.queryRewritingContextMessages);

      if (wouldBenefitFromRewrite(query) || context.length > 0) {
        const result = await rewriteQuery(query, context);
        if (result.rewritten !== result.original) {
          rewriteInfo = {
            original: result.original,
            rewritten: result.rewritten,
            method: result.method,
          };
          query = result.rewritten;
          logger.info(`[HybridSearch] Query rewritten: "${result.original}" -> "${result.rewritten}" (${result.method})`);
        }

        // Record query rewrite stage
        await addQueryRewriteStage(traceId, {
          original: result.original,
          rewritten: result.rewritten,
          method: result.method,
          timeMs: Date.now() - rewriteStart,
        });
      }
    } catch (error) {
      logger.warn(`[HybridSearch] Query rewriting failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get embedding
  const queryEmbedding = await getEmbedding(query);

  // Candidate retrieval stage
  const retrievalStart = Date.now();
  const candidates = await search({
    ...options,
    limit: candidateLimit,
  });

  await addCandidateRetrievalStage(traceId, {
    candidates: candidates.length,
    timeMs: Date.now() - retrievalStart,
  });

  if (candidates.length === 0) {
    await completeTrace(traceId, []);
    return [];
  }

  // Entity filtering stage
  const filteringStart = Date.now();
  const entityScored = filterByEntities(candidates, options.queryEntities || []);

  await addEntityFilteringStage(traceId, {
    entities: options.queryEntities || [],
    results: entityScored.length,
    timeMs: Date.now() - filteringStart,
  });

  const boostedCandidates = entityScored.map(({ memory, entityBoost }) => ({
    ...memory,
    _entityBoost: entityBoost,
  }));

  // Hybrid scoring stage
  const scoringStart = Date.now();
  const scored = await hybridScore(queryEmbedding, boostedCandidates, {
    ...options.hybridOptions,
    weights: {
      semantic: 0.30,
      recency: 0.20,
      coactivation: 0.10,
      importance: 0.15,
      confidence: 0.15,
      feedback: 0.10,
      ...options.hybridOptions?.weights,
    },
    decayDays: 7,
  });

  await addHybridScoringStage(traceId, {
    results: scored.length,
    timeMs: Date.now() - scoringStart,
  });

  // Reranking stage
  const rerankStart = Date.now();
  const reranked = applyEntityBoostAndRerank(scored);

  await addRerankingStage(traceId, {
    results: reranked.length,
    timeMs: Date.now() - rerankStart,
  });

  const topResults = reranked.slice(0, resultLimit);

  // Complete trace with results
  const traceResults = topResults.map((r) => ({
    type: r.memory?.type,
    content: r.memory?.content,
    hybridScore: r.totalScore,
  }));

  await completeTrace(traceId, traceResults);

  return topResults.map((scoredItem, index) => ({
    ...scoredItem.memory,
    hybridScore: scoredItem.totalScore,
    semanticScore: scoredItem.components.semantic,
    recencyScore: scoredItem.components.recency,
    coactivationScore: scoredItem.components.coactivation,
    importanceScore: scoredItem.components.importance,
    confidenceScore: scoredItem.components.confidence,
    feedbackScore: scoredItem.components.feedback,
    entityBoost: (scoredItem.memory as any)._entityBoost || 0.5,
    rank: index + 1,
    ...(rewriteInfo && { queryRewrite: rewriteInfo }),
  }));
}
