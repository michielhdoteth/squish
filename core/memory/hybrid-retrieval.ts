import { hybridScore, HybridScorerOptions } from './hybrid-scorer.js';
import { getEmbedding } from '../embeddings.js';
import { searchMemories, SearchInput, MemoryRecord } from './memories.js';
import { filterByEntities } from './entity-resolver.js';
import { rewriteQuery, wouldBenefitFromRewrite } from './query-rewriter.js';
import { collectRecentContext } from './context-collector.js';
import { config } from '../../config.js';
import { logger } from '../logger.js';

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

  let query = options.query;
  let rewriteInfo: { original: string; rewritten: string; method: string } | null = null;

  if (config.queryRewritingEnabled && !options.skipRewrite && options.sessionId) {
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
      }
    } catch (error) {
      logger.warn(`[HybridSearch] Query rewriting failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const queryEmbedding = await getEmbedding(query);

  const candidates = await searchMemories({
    ...options,
    limit: candidateLimit,
  });

  if (candidates.length === 0) return [];

  const entityScored = filterByEntities(candidates, options.queryEntities || []);

  const boostedCandidates = entityScored.map(({ memory, entityBoost }) => ({
    ...memory,
    _entityBoost: entityBoost,
  }));

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

  const reranked = applyEntityBoostAndRerank(scored);
  const topResults = reranked.slice(0, resultLimit);

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
