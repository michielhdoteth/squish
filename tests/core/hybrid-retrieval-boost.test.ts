import { describe, expect, it } from 'bun:test';
import { applyEntityBoostAndRerank } from '../../core/memory/hybrid-retrieval.js';

describe('hybrid-retrieval entity boost', () => {
  it('re-ranks when entity boost strongly differs', () => {
    const ranked = applyEntityBoostAndRerank([
      {
        memoryId: 'a',
        memory: { _entityBoost: 0.1 },
        totalScore: 80,
        components: { semantic: 80, recency: 80, coactivation: 80, importance: 80 },
        rank: 1,
        explanation: '',
      },
      {
        memoryId: 'b',
        memory: { _entityBoost: 1.0 },
        totalScore: 70,
        components: { semantic: 70, recency: 70, coactivation: 70, importance: 70 },
        rank: 2,
        explanation: '',
      },
    ]);

    expect(ranked[0].memoryId).toBe('b');
    expect(ranked[0].rank).toBe(1);
  });
});
