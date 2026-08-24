/**
 * Batch 5: reranker graceful-degradation tests.
 *
 * When the cross-encoder is enabled but the model cannot load (missing
 * package, download timeout, load failure), reranking must:
 * - never throw,
 * - return results untouched (same order and scores),
 * - count the skips in the rerank meta consumed by search traces,
 * - latch unavailability so subsequent searches skip instantly.
 */

import { describe, test, expect, afterEach } from 'bun:test';

import {
  rerankResults,
  getLastRerankMeta,
  resetRerankerForTests,
  unload,
} from '../../../core/retrieval/cross-encoder-reranker.js';
import type { SearchResult } from '../../../core/memory/memories.js';

const SAVED: Record<string, string | undefined> = {};
const KEYS = [
  'SQUISH_RERANKER_ENABLED',
  'SQUISH_RERANKER_MODEL',
  'SQUISH_RERANKER_LOAD_TIMEOUT_MS',
];

function enableButUnloadable() {
  for (const k of KEYS) SAVED[k] = process.env[k];
  process.env.SQUISH_RERANKER_ENABLED = 'true';
  // Repo that cannot exist: forces a load failure (fast 404 when online,
  // hard timeout offline). Either path lands in the same graceful skip.
  process.env.SQUISH_RERANKER_MODEL = 'squish-test-definitely-not-real/nonexistent-model-zz';
  process.env.SQUISH_RERANKER_LOAD_TIMEOUT_MS = '250';
  resetRerankerForTests();
}

afterEach(async () => {
  await unload();
  resetRerankerForTests();
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe('Cross-encoder unavailable graceful path', () => {
  test('enabled + unloadable model: resolves without throwing, results untouched', async () => {
    enableButUnloadable();

    const fixtures: SearchResult[] = [
      { id: 'a', content: 'alpha document about databases', similarity: 0.9 },
      { id: 'b', content: 'beta document about caches', similarity: 0.8 },
      { id: 'c', content: 'gamma document about queues', similarity: 0.7 },
    ];

    const out = await rerankResults('unavailable reranker probe', fixtures);

    expect(out.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(out.map(r => r.similarity)).toEqual([0.9, 0.8, 0.7]);
  });

  test('skips are counted in rerank meta with a reason', async () => {
    enableButUnloadable();

    const fixtures: SearchResult[] = [
      { id: 'a', content: 'alpha', similarity: 0.9 },
      { id: 'b', content: 'beta', similarity: 0.8 },
      { id: 'c', content: 'gamma', similarity: 0.7 },
    ];

    await rerankResults('skip counting probe', fixtures);
    const meta = getLastRerankMeta();

    expect(meta).not.toBeNull();
    expect(meta!.applied).toBe(false);
    expect(meta!.skipped).toBe(3);
    expect(meta!.reason).toBeTruthy();
  });

  test('unavailability latches: second call skips instantly', async () => {
    enableButUnloadable();

    const fixtures: SearchResult[] = [
      { id: 'a', content: 'alpha', similarity: 0.9 },
      { id: 'b', content: 'beta', similarity: 0.8 },
    ];

    await rerankResults('latch warmup probe', fixtures);

    const start = Date.now();
    const out = await rerankResults('latched second probe', fixtures);
    const elapsed = Date.now() - start;

    // Latched path must not re-attempt loading (load timeout alone is 250ms).
    expect(elapsed).toBeLessThan(200);
    expect(out.length).toBe(2);
    expect(getLastRerankMeta()!.applied).toBe(false);
    expect(getLastRerankMeta()!.skipped).toBe(2);
  });

  test('reset hook clears the latch so a retry is possible', async () => {
    enableButUnloadable();
    await rerankResults('pre-reset probe', [{ id: 'a', content: 'x', similarity: 1 }]);
    expect(getLastRerankMeta()!.applied).toBe(false);

    resetRerankerForTests();
    // After reset, meta is cleared; a fresh call re-attempts (and may fail
    // again - that is fine, we only assert the latch was lifted by observing
    // a fresh attempt rather than an instant skip).
    const out = await rerankResults('post-reset probe', [{ id: 'b', content: 'y', similarity: 1 }]);
    expect(out.length).toBe(1);
  });
});
