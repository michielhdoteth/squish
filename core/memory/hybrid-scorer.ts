/**
 * Hybrid Scorer
 * Multi-factor relevance scoring combining semantic similarity, recency, co-activation, and importance
 * Provides normalized scores (0-100) for memory ranking
 */

import { logger } from '../../core/logger.js';

export interface ScoredMemory {
  memoryId: string;
  memory: any;
  totalScore: number; // 0-100
  components: {
    semantic: number; // 0-100 - Cosine similarity
    recency: number; // 0-100 - Time decay
    coactivation: number; // 0-100 - Co-occurrence strength
    importance: number; // 0-100 - Relevance/salience
  };
  rank: number;
  explanation: string;
}

export interface HybridScorerOptions {
  weights?: {
    semantic?: number;
    recency?: number;
    coactivation?: number;
    importance?: number;
  };
  decayDays?: number; // Days for recency half-life
  minSemanticScore?: number; // Filter threshold
  includeExplanation?: boolean;
}

/**
 * Calculate hybrid relevance score for memories
 * Combines: semantic similarity, recency, co-activation, and importance
 */
export async function hybridScore(
  queryEmbedding: number[] | null,
  memories: any[],
  options: HybridScorerOptions = {}
): Promise<ScoredMemory[]> {
  // Default weights (0.4, 0.2, 0.2, 0.2 = 1.0 total)
  const weights = {
    semantic: options.weights?.semantic ?? 0.4,
    recency: options.weights?.recency ?? 0.2,
    coactivation: options.weights?.coactivation ?? 0.2,
    importance: options.weights?.importance ?? 0.2,
  };

  const decayDays = options.decayDays ?? 30;
  const minSemanticScore = options.minSemanticScore ?? 0.0;

  const scored: ScoredMemory[] = [];
  const now = new Date();

  for (const memory of memories) {
    // Skip if embedding-only filtering is requested and score is below threshold
    if (queryEmbedding && weights.semantic > 0) {
      const semanticScore = calculateSemanticScore(queryEmbedding, memory);
      if (semanticScore < minSemanticScore) continue;
    }

    // Calculate component scores
    const components = {
      semantic: queryEmbedding ? calculateSemanticScore(queryEmbedding, memory) : 50,
      recency: calculateRecencyScore(memory, now, decayDays),
      coactivation: calculateCoactivationScore(memory),
      importance: calculateImportanceScore(memory),
    };

    // Calculate weighted total
    const totalScore = Math.min(
      100,
      components.semantic * weights.semantic +
        components.recency * weights.recency +
        components.coactivation * weights.coactivation +
        components.importance * weights.importance
    );

    scored.push({
      memoryId: memory.id,
      memory,
      totalScore: Math.round(totalScore * 100) / 100,
      components: {
        semantic: Math.round(components.semantic * 100) / 100,
        recency: Math.round(components.recency * 100) / 100,
        coactivation: Math.round(components.coactivation * 100) / 100,
        importance: Math.round(components.importance * 100) / 100,
      },
      rank: 0,
      explanation: options.includeExplanation
        ? generateScoreExplanation(components, weights, memory)
        : '',
    });
  }

  // Sort by total score descending and assign ranks
  scored.sort((a, b) => b.totalScore - a.totalScore);
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  return scored;
}

/**
 * Calculate semantic similarity score (0-100)
 * Uses cosine similarity between query and memory embeddings
 */
function calculateSemanticScore(queryEmbedding: number[], memory: any): number {
  if (!memory.embedding || queryEmbedding.length === 0) {
    return 50; // Default to neutral score
  }

  try {
    const memoryEmbedding = Array.isArray(memory.embedding)
      ? memory.embedding
      : typeof memory.embedding === 'string'
        ? JSON.parse(memory.embedding)
        : null;

    if (!memoryEmbedding || memoryEmbedding.length === 0) {
      return 50;
    }

    // Cosine similarity
    const cosineSimilarity = calculateCosineSimilarity(queryEmbedding, memoryEmbedding);

    // Convert -1...1 range to 0...100 range
    // Cosine similarity is typically 0...1 for normalized vectors
    return Math.max(0, Math.min(100, (cosineSimilarity + 1) * 50));
  } catch (error) {
    logger.error('Error calculating semantic score', error);
    return 50;
  }
}

/**
 * Calculate recency score (0-100)
 * Uses exponential decay based on days since creation
 * Half-life is configurable (default 30 days)
 */
function calculateRecencyScore(memory: any, now: Date, decayDays: number): number {
  if (!memory.createdAt) return 50;

  const createdDate = new Date(memory.createdAt);
  const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000);

  // Exponential decay: score = 100 * (0.5 ^ (days / halfLife))
  const score = 100 * Math.pow(0.5, daysSinceCreation / decayDays);

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate co-activation score (0-100)
 * Based on how often this memory appears with others
 */
function calculateCoactivationScore(memory: any): number {
  if (!memory.coactivationScore || memory.coactivationScore === 0) {
    return 10; // Default low score
  }

  // Normalize co-activation score to 0-100 range
  // Assuming co-activation scores are typically 0-20+
  const normalized = Math.min(100, memory.coactivationScore * 5);
  return normalized;
}

/**
 * Calculate importance score (0-100)
 * Based on relevance score, tier classification, and protection status
 */
function calculateImportanceScore(memory: any): number {
  let score = 50; // Base score

  // Add points for tier
  if (memory.tier === 'hot') {
    score += 30;
  } else if (memory.tier === 'warm') {
    score += 15;
  } else if (memory.tier === 'cold') {
    score += 0;
  }

  // Add points for relevance score (0-100)
  if (memory.relevanceScore) {
    score += memory.relevanceScore * 0.2; // Max +20 points
  }

  // Add points for pinned/protected status
  if (memory.isPinned) score += 10;
  if (memory.isProtected) score += 10;

  // Subtract points for being marked for merging
  if (memory.isMergeable || memory.isMerged) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Generate human-readable explanation for score
 */
function generateScoreExplanation(
  components: {
    semantic: number;
    recency: number;
    coactivation: number;
    importance: number;
  },
  weights: {
    semantic: number;
    recency: number;
    coactivation: number;
    importance: number;
  },
  memory: any
): string {
  const parts: string[] = [];

  // Semantic similarity
  if (components.semantic > 70) {
    parts.push(`highly relevant (${components.semantic.toFixed(0)})`);
  } else if (components.semantic > 50) {
    parts.push(`somewhat relevant (${components.semantic.toFixed(0)})`);
  } else {
    parts.push(`low relevance (${components.semantic.toFixed(0)})`);
  }

  // Recency
  if (components.recency > 70) {
    parts.push(`recent`);
  } else if (components.recency > 30) {
    parts.push(`moderately recent`);
  } else {
    parts.push(`older`);
  }

  // Tier
  if (memory.tier === 'hot') {
    parts.push(`active memory`);
  } else if (memory.tier === 'warm') {
    parts.push(`accessible memory`);
  } else {
    parts.push(`archived memory`);
  }

  // Frequently co-activated
  if (components.coactivation > 60) {
    parts.push(`frequently associated`);
  }

  return parts.join(', ');
}

/**
 * Score and rank memories by relevance
 * Convenience function combining scoring and ranking
 */
export async function scoreAndRankMemories(
  queryEmbedding: number[] | null,
  memories: any[],
  topK: number = 10,
  options: HybridScorerOptions = {}
): Promise<ScoredMemory[]> {
  const scored = await hybridScore(queryEmbedding, memories, options);

  logger.debug('Scored and ranked memories', {
    total: scored.length,
    topK,
    topScores: scored.slice(0, topK).map((s) => ({
      id: s.memoryId,
      score: s.totalScore,
    })),
  });

  return scored.slice(0, topK);
}

/**
 * Get score distribution for diagnostics
 */
export function getScoreDistribution(
  scored: ScoredMemory[]
): {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
} {
  if (scored.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
  }

  const scores = scored.map((s) => s.totalScore).sort((a, b) => a - b);

  return {
    min: scores[0],
    max: scores[scores.length - 1],
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    median: scores[Math.floor(scores.length / 2)],
    p95: scores[Math.floor((95 / 100) * scores.length)],
    p99: scores[Math.floor((99 / 100) * scores.length)],
  };
}
