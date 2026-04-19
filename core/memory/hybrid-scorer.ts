/** Hybrid Scorer - Multi-factor relevance scoring for memory ranking */

import { logger } from '../../core/logger.js';
import { cosineSimilarity } from '../utils/vector-operations.js';

export interface ScoredMemory {
  memoryId: string;
  memory: any;
  totalScore: number;
  components: {
    semantic: number;
    recency: number;
    coactivation: number;
    importance: number;
    confidence: number;
    feedback: number;
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
    confidence?: number;
    feedback?: number;
  };
  decayDays?: number;
  minSemanticScore?: number;
  includeExplanation?: boolean;
}

export async function hybridScore(
  queryEmbedding: number[] | null,
  memories: any[],
  options: HybridScorerOptions = {}
): Promise<ScoredMemory[]> {
  const weights = {
    semantic: options.weights?.semantic ?? 0.30,
    recency: options.weights?.recency ?? 0.20,
    coactivation: options.weights?.coactivation ?? 0.10,
    importance: options.weights?.importance ?? 0.15,
    confidence: options.weights?.confidence ?? 0.15,
    feedback: options.weights?.feedback ?? 0.10,
  };

  const decayDays = options.decayDays ?? 30;
  const minSemanticScore = options.minSemanticScore ?? 0.0;

  const scored: ScoredMemory[] = [];
  const now = new Date();

  for (const memory of memories) {
    if (queryEmbedding && weights.semantic > 0) {
      const semanticScore = calculateSemanticScore(queryEmbedding, memory);
      if (semanticScore < minSemanticScore) continue;
    }

    const components = {
      semantic: queryEmbedding ? calculateSemanticScore(queryEmbedding, memory) : 50,
      recency: calculateRecencyScore(memory, now, decayDays),
      coactivation: calculateCoactivationScore(memory),
      importance: calculateImportanceScore(memory),
      confidence: calculateConfidenceScore(memory),
      feedback: calculateFeedbackScore(memory),
    };

    const totalScore = Math.min(
      100,
      components.semantic * weights.semantic +
        components.recency * weights.recency +
        components.coactivation * weights.coactivation +
        components.importance * weights.importance +
        components.confidence * weights.confidence +
        components.feedback * weights.feedback
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
        confidence: Math.round(components.confidence * 100) / 100,
        feedback: Math.round(components.feedback * 100) / 100,
      },
      rank: 0,
      explanation: options.includeExplanation
        ? generateScoreExplanation(components, weights, memory)
        : '',
    });
  }

  scored.sort((a, b) => b.totalScore - a.totalScore);
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  return scored;
}

function calculateSemanticScore(queryEmbedding: number[], memory: any): number {
  if (!memory.embedding || queryEmbedding.length === 0) return 50;

  try {
    let memoryEmbedding: number[] | null = null;

    if (Array.isArray(memory.embedding)) {
      memoryEmbedding = memory.embedding;
    } else if (typeof memory.embedding === 'string') {
      memoryEmbedding = JSON.parse(memory.embedding);
    }

    if (!memoryEmbedding || memoryEmbedding.length === 0) return 50;

    const semanticScore = cosineSimilarity(queryEmbedding, memoryEmbedding);
    return Math.max(0, Math.min(100, (semanticScore + 1) * 50));
  } catch (error) {
    logger.error('Error calculating semantic score', error);
    return 50;
  }
}

function calculateRecencyScore(memory: any, now: Date, decayDays: number): number {
  // Enhanced bi-temporal recency scoring: considers validity period and learning time
  const validFromDate = memory.validFrom ? new Date(memory.validFrom) : null;
  const validToDate = memory.validTo ? new Date(memory.validTo) : null;
  const recordedAtDate = memory.recordedAt ? new Date(memory.recordedAt) : null;
  const createdDate = memory.createdAt ? new Date(memory.createdAt) : null;

  // Calculate score based on how relevant the memory is right now
  let score = 50; // Default neutral score

  // If we have a validity period, score based on current time's position within that period
  if (validFromDate && validToDate) {
    const timeInPeriod = now.getTime() - validFromDate.getTime();
    const periodLength = validToDate.getTime() - validFromDate.getTime();
    
    if (periodLength > 0) {
      // If now is within the validity period, high score
      if (now >= validFromDate && now <= validToDate) {
        // Full score if right in middle, decreasing toward edges
        const progress = timeInPeriod / periodLength;
        const distanceFromCenter = Math.abs(0.5 - progress) * 2; // 0 at center, 1 at edges
        score = 100 * (1 - distanceFromCenter * 0.8); // 100 at center, 40 at edges
      } else {
        // Outside validity period - score based on how recently it expired or how far in future
        if (now < validFromDate) {
          // Future validity - score based on how soon it becomes valid
          const daysUntilValid = (validFromDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
          score = Math.max(20, 100 - Math.min(80, daysUntilValid / decayDays * 100));
        } else {
          // Past validity - score based on how recently it expired
          const daysSinceExpired = (now.getTime() - validToDate.getTime()) / (24 * 60 * 60 * 1000);
          score = Math.max(10, 60 - Math.min(50, daysSinceExpired / decayDays * 100));
        }
      }
    }
  } 
  // If we only have validFrom (open-ended validity)
  else if (validFromDate) {
    const daysSinceValid = (now.getTime() - validFromDate.getTime()) / (24 * 60 * 60 * 1000);
    if (now >= validFromDate) {
      // Still valid - decay from full score over time
      score = Math.max(30, 100 - Math.min(70, daysSinceValid / decayDays * 100));
    } else {
      // Becomes valid in future
      const daysUntilValid = (validFromDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      score = Math.max(20, 100 - Math.min(80, daysUntilValid / decayDays * 100));
    }
  }
  // Fallback to learned/recorded time
  else {
    const learnedDate = recordedAtDate || createdDate;
    if (learnedDate) {
      const daysSinceLearned = (now.getTime() - learnedDate.getTime()) / (24 * 60 * 60 * 1000);
      score = 100 * Math.pow(0.5, daysSinceLearned / decayDays);
      score = Math.max(0, Math.min(100, score));
    }
  }

  return Math.round(score * 10) / 10; // Return one decimal place
}

function calculateCoactivationScore(memory: any): number {
  if (!memory.coactivationScore || memory.coactivationScore === 0) return 10;
  return Math.min(100, memory.coactivationScore * 5);
}

function calculateImportanceScore(memory: any): number {
  let score = 50;

  // Simplified: hot or cold only (warm removed)
  if (memory.tier === 'hot') score += 30;
  // No bonus for cold - it's the fallback

  if (memory.relevanceScore) score += memory.relevanceScore * 0.2;
  if (memory.isPinned) score += 10;
  if (memory.isProtected) score += 10;
  if (memory.isMergeable || memory.isMerged) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function calculateConfidenceScore(memory: any): number {
  let score = 50;

  const signals = memory.metadata?.memorySignals;

  if (signals) {
    if (signals.priority === 'high') score += 25;

    if (signals.explicitTriggers && signals.explicitTriggers.length > 0) {
      score += 15 * Math.min(signals.explicitTriggers.length, 2);
    }

    if (signals.implicit) {
      if (signals.implicit.decision) score += 10;
      if (signals.implicit.correction) score += 15;
      if (signals.implicit.preference) score += 8;
      if (signals.implicit.workflowRule) score += 12;
      if (signals.implicit.lesson) score += 10;
    }

    if (signals.requiresConflictCheck) score -= 5;
  }

  switch (memory.type) {
    case 'decision': score += 10; break;
    case 'preference': score += 5; break;
    case 'fact': score += 8; break;
    case 'context': score += 3; break;
  }

  if (memory.source === 'mcp') score += 5;

  if (memory.accessCount && memory.accessCount > 5) {
    score += Math.min(10, memory.accessCount / 2);
  }

  return Math.max(0, Math.min(100, score));
}

function calculateFeedbackScore(memory: any): number {
  const retrievalPriority = memory.retrievalPriority ?? 50;
  return Math.max(0, Math.min(100, retrievalPriority));
}

function generateScoreExplanation(
  components: ScoredMemory['components'],
  weights: ScoredMemory['components'],
  memory: any
): string {
  const parts: string[] = [];

  if (components.semantic > 70) parts.push(`highly relevant (${components.semantic.toFixed(0)})`);
  else if (components.semantic > 50) parts.push(`somewhat relevant (${components.semantic.toFixed(0)})`);
  else parts.push(`low relevance (${components.semantic.toFixed(0)})`);

  if (components.recency > 70) parts.push('recent');
  else if (components.recency > 30) parts.push('moderately recent');
  else parts.push('older');

  // Simplified: hot or cold only (warm removed)
  if (memory.tier === 'hot') parts.push('active memory');
  else parts.push('archived memory');

  if (components.coactivation > 60) parts.push('frequently associated');

  if (components.confidence > 80) parts.push('high confidence');
  else if (components.confidence > 60) parts.push('moderate confidence');
  else if (components.confidence < 40) parts.push('low confidence');

  if (components.feedback > 70) parts.push('frequently useful');
  else if (components.feedback < 30) parts.push('rarely used');

  return parts.join(', ');
}

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
    topScores: scored.slice(0, topK).map((s) => ({ id: s.memoryId, score: s.totalScore })),
  });

  return scored.slice(0, topK);
}

export function getScoreDistribution(scored: ScoredMemory[]): {
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
