import type { MemoryRecord } from '../lib/types.js';
import { hybridSearch as currentHybridSearch } from './hybrid-search.js';
import type { SearchInput } from './memories.js';

export interface HybridSearchOptions extends SearchInput {
  candidateLimit?: number;
  resultLimit?: number;
}

export interface HybridSearchResult extends MemoryRecord {
  hybridScore: number;
  semanticScore: number;
  recencyScore: number;
  importanceScore: number;
  coactivationScore: number;
  rank: number;
  explanation: string;
}

type ScoredItem = {
  memoryId: string;
  memory: Record<string, unknown>;
  totalScore: number;
  components: Record<string, number>;
  rank: number;
  explanation: string;
};

export function applyEntityBoostAndRerank<T extends ScoredItem>(scored: T[]): T[] {
  return scored
    .map((item) => {
      const rawBoost = item.memory._entityBoost;
      const entityBoost = typeof rawBoost === 'number' ? rawBoost : 0;
      return {
        ...item,
        totalScore: item.totalScore + entityBoost * 20,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const limit = options.resultLimit ?? options.limit ?? 5;
  const results = await currentHybridSearch(options, {
    limit,
    project: options.project,
    type: options.type,
    tags: options.tags,
  });

  return results.map((result, index) => ({
    ...result,
    hybridScore: result.similarity ?? 0,
    semanticScore: result.similarity ?? 0,
    recencyScore: 0,
    importanceScore: typeof result.importance === 'number' ? result.importance : 0,
    coactivationScore: 0,
    rank: index + 1,
    explanation: 'Compatibility result from current hybrid search',
  }));
}
