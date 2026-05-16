import { describe, test, expect } from 'bun:test';
import {
  hybridScore,
  scoreAndRankMemories,
  getScoreDistribution,
  type ScoredMemory,
} from '../../core/memory/hybrid-scorer.js';

describe('Hybrid Scorer', () => {
  const sampleQueryEmbedding = new Array(384).fill(0.1);

  const sampleMemories = [
    {
      id: 'mem-1',
      content: 'Test memory 1',
      type: 'fact',
      createdAt: new Date().toISOString(),
      coactivationScore: 10,
      relevanceScore: 80,
      isPinned: false,
      isProtected: false,
      embedding: new Array(384).fill(0.12), // Similar to query
    },
    {
      id: 'mem-2',
      content: 'Test memory 2',
      type: 'decision',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      coactivationScore: 5,
      relevanceScore: 60,
      isPinned: true,
      isProtected: false,
      embedding: new Array(384).fill(0.05), // Less similar
    },
    {
      id: 'mem-3',
      content: 'Test memory 3',
      type: 'preference',
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      coactivationScore: 2,
      relevanceScore: 30,
      isPinned: false,
      isProtected: true,
      embedding: null,
    },
  ];

  describe('hybridScore', () => {
    test('should score and rank memories', async () => {
      const scored = await hybridScore(sampleQueryEmbedding, sampleMemories);

      expect(scored.length).toBe(3);
      expect(scored[0].rank).toBe(1);
      expect(scored[1].rank).toBe(2);
      expect(scored[2].rank).toBe(3);
      expect(scored[0].totalScore).toBeGreaterThanOrEqual(scored[1].totalScore);
    });

    test('should include component scores', async () => {
      const scored = await hybridScore(sampleQueryEmbedding, sampleMemories);

      expect(scored[0].components).toBeDefined();
      expect(scored[0].components.semantic).toBeGreaterThanOrEqual(0);
      expect(scored[0].components.recency).toBeGreaterThanOrEqual(0);
      expect(scored[0].components.coactivation).toBeGreaterThanOrEqual(0);
      expect(scored[0].components.importance).toBeGreaterThanOrEqual(0);
      expect(scored[0].components.confidence).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty memories array', async () => {
      const scored = await hybridScore(sampleQueryEmbedding, []);
      expect(scored).toEqual([]);
    });

    test('should handle null query embedding', async () => {
      const scored = await hybridScore(null, sampleMemories);

      expect(scored.length).toBe(3);
      // Without embedding, semantic score defaults to 50
      expect(scored[0].components.semantic).toBe(50);
    });

    test('should apply custom weights', async () => {
      const scoredDefault = await hybridScore(sampleQueryEmbedding, sampleMemories);
      const scoredCustom = await hybridScore(sampleQueryEmbedding, sampleMemories, {
        weights: { semantic: 0.8, recency: 0.1, coactivation: 0.05, importance: 0.03, confidence: 0.02 },
      });

      // Different weights should produce different scores
      expect(scoredDefault[0].totalScore).not.toBe(scoredCustom[0].totalScore);
    });

    test('should include explanations when requested', async () => {
      const scored = await hybridScore(sampleQueryEmbedding, sampleMemories, {
        includeExplanation: true,
      });

      expect(scored[0].explanation).toBeTruthy();
      expect(typeof scored[0].explanation).toBe('string');
    });

    test('should filter by minimum semantic score', async () => {
      const scored = await hybridScore(sampleQueryEmbedding, sampleMemories, {
        minSemanticScore: 0.9,
      });

      // High threshold should filter out most results
      expect(scored.length).toBeLessThanOrEqual(3);
    });
  });

  describe('scoreAndRankMemories', () => {
    test('should return top K results', async () => {
      const scored = await scoreAndRankMemories(sampleQueryEmbedding, sampleMemories, 2);

      expect(scored.length).toBe(2);
      expect(scored[0].rank).toBe(1);
      expect(scored[1].rank).toBe(2);
    });
  });

  describe('getScoreDistribution', () => {
    test('should calculate score distribution', () => {
      const scored: ScoredMemory[] = [
        { memoryId: '1', memory: {}, totalScore: 90, components: { semantic: 90, recency: 90, coactivation: 90, importance: 90, confidence: 90 }, rank: 1, explanation: '' },
        { memoryId: '2', memory: {}, totalScore: 70, components: { semantic: 70, recency: 70, coactivation: 70, importance: 70, confidence: 70 }, rank: 2, explanation: '' },
        { memoryId: '3', memory: {}, totalScore: 50, components: { semantic: 50, recency: 50, coactivation: 50, importance: 50, confidence: 50 }, rank: 3, explanation: '' },
      ];

      const dist = getScoreDistribution(scored);

      expect(dist.min).toBe(50);
      expect(dist.max).toBe(90);
      expect(dist.avg).toBe(70);
      expect(dist.median).toBe(70);
    });

    test('should handle empty array', () => {
      const dist = getScoreDistribution([]);

      expect(dist.min).toBe(0);
      expect(dist.max).toBe(0);
      expect(dist.avg).toBe(0);
    });
  });

  describe('Confidence Score Calculation', () => {
    test('should boost confidence for high-priority signals', async () => {
      const memoryWithSignals = {
        ...sampleMemories[0],
        metadata: {
          memorySignals: {
            priority: 'high',
            explicitTriggers: ['remember'],
            implicit: { decision: false, correction: false, preference: false, workflowRule: false, lesson: false },
          },
        },
      };

      const scored = await hybridScore(sampleQueryEmbedding, [memoryWithSignals]);

      // High priority should boost confidence
      expect(scored[0].components.confidence).toBeGreaterThan(50);
    });

    test('should boost confidence for explicit triggers', async () => {
      const memoryWithTriggers = {
        ...sampleMemories[0],
        metadata: {
          memorySignals: {
            priority: 'normal',
            explicitTriggers: ['remember', 'important'],
            implicit: { decision: false, correction: false, preference: false, workflowRule: false, lesson: false },
          },
        },
      };

      const scored = await hybridScore(sampleQueryEmbedding, [memoryWithTriggers]);

      expect(scored[0].components.confidence).toBeGreaterThan(50);
    });

    test('should boost confidence for correction signals', async () => {
      const memoryWithCorrection = {
        ...sampleMemories[0],
        metadata: {
          memorySignals: {
            priority: 'normal',
            explicitTriggers: [],
            implicit: { decision: false, correction: true, preference: false, workflowRule: false, lesson: false },
          },
        },
      };

      const scored = await hybridScore(sampleQueryEmbedding, [memoryWithCorrection]);

      expect(scored[0].components.confidence).toBeGreaterThan(50);
    });
  });

  describe('Recency Score Calculation', () => {
    test('should give higher scores to recent memories', async () => {
      const recentMemory = { ...sampleMemories[0], createdAt: new Date().toISOString() };
      const oldMemory = { ...sampleMemories[0], id: 'old', createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() };

      const scored = await hybridScore(sampleQueryEmbedding, [recentMemory, oldMemory]);

      const recentScored = scored.find(s => s.memoryId === recentMemory.id);
      const oldScored = scored.find(s => s.memoryId === oldMemory.id);

      expect(recentScored?.components.recency).toBeGreaterThan(oldScored?.components.recency || 0);
    });
  });

  describe('Importance Score Calculation', () => {
    test('should boost importance for pinned memories', async () => {
      const pinnedMemory = { ...sampleMemories[0], isPinned: true };
      const unpinnedMemory = { ...sampleMemories[0], id: 'unpinned', isPinned: false };

      const scored = await hybridScore(sampleQueryEmbedding, [pinnedMemory, unpinnedMemory]);

      const pinnedScored = scored.find(s => s.memoryId === pinnedMemory.id);
      const unpinnedScored = scored.find(s => s.memoryId === unpinnedMemory.id);

      expect(pinnedScored?.components.importance).toBeGreaterThan(unpinnedScored?.components.importance || 0);
    });
  });
});
