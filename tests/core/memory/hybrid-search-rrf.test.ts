import { describe, expect, test } from 'bun:test';

import { rrfFusion } from '../../../core/memory/hybrid-search.js';

describe('RRF fusion', () => {
  test('combines vector and keyword rankings with stronger shared hits', () => {
    const vector = [
      { id: 'a', content: 'alpha', similarity: 0.9 },
      { id: 'b', content: 'beta', similarity: 0.8 },
      { id: 'c', content: 'gamma', similarity: 0.7 },
    ] as any;

    const keyword = [
      { id: 'c', content: 'gamma', similarity: 1 },
      { id: 'a', content: 'alpha', similarity: 0.8 },
    ] as any;

    const fused = rrfFusion(vector, keyword, 3);
    expect(fused.length).toBe(3);
    expect(fused[0].id).toBe('a');
    expect(fused.map((x: any) => x.id)).toContain('c');
  });
});
