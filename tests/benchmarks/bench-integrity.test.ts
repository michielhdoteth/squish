/**
 * Benchmark harness integrity tests (Batch 9).
 *
 * The memory benchmark is the measurement instrument for contradiction /
 * abstention claims — these tests verify the instrument itself: fixture
 * determinism, scorer correctness on known cases, and verdict mapping
 * parity with the production recall-assessment thresholds.
 */

import { describe, test, expect } from 'bun:test';
import {
  buildBenchCorpus,
  buildFactUpdateMemories,
  buildFalsehoodQueries,
  buildUnanswerableQueries,
  BENCH_CATEGORIES,
} from '../../tests/benchmarks/fixtures.js';
import {
  scoreQuery,
  assessVerdict,
  QUALIFIED_MIN,
  type ScoreInput,
} from '../../scripts/run-memory-bench.js';

describe('bench fixtures', () => {
  test('corpus is deterministic across builds', () => {
    const a = buildBenchCorpus();
    const b = buildBenchCorpus();
    expect(a.memories.length).toBe(b.memories.length);
    expect(a.queries.length).toBe(b.queries.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('covers all four conflict categories', () => {
    const { queries } = buildBenchCorpus();
    for (const cat of BENCH_CATEGORIES) {
      expect(queries.some((q) => q.category === cat)).toBe(true);
    }
  });

  test('fact-update subjects have exactly three versions each', () => {
    const memories = buildFactUpdateMemories();
    const v1 = memories.filter((m) => m.benchId.endsWith('_v1'));
    const v2 = memories.filter((m) => m.benchId.endsWith('_v2'));
    const v3 = memories.filter((m) => m.benchId.endsWith('_v3'));
    expect(v1.length).toBe(v2.length);
    expect(v2.length).toBe(v3.length);
    expect(v1.length).toBeGreaterThanOrEqual(30);
  });

  test('every falsehood query declares its wrong answer', () => {
    for (const q of buildFalsehoodQueries()) {
      expect(q.wrongIfTop1?.length ?? 0).toBeGreaterThan(0);
      expect(q.expectTop1?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('unanswerable queries declare no expected memory', () => {
    for (const q of buildUnanswerableQueries()) {
      expect(q.expectTop1).toBeUndefined();
      expect(q.expectTop3).toBeUndefined();
      expect(q.wrongIfTop1).toBeUndefined();
    }
  });
});

describe('bench scorer', () => {
  const input = (over: Partial<ScoreInput>): ScoreInput => ({
    top1BenchId: null,
    top1Confidence: null,
    top3BenchIds: [],
    verdict: 'no_reliable_memory',
    bestConfidence: 0,
    ...over,
  });

  test('planted falsehood: asserting the false claim at QUALIFIED+ is confident-wrong (-1)', () => {
    const q = { benchId: 'pf_q', category: 'planted-falsehood' as const, query: 'q', expectTop1: ['pf_fact'], wrongIfTop1: ['pf_false'] };
    const r = scoreQuery(q, input({ top1BenchId: 'pf_false', top1Confidence: QUALIFIED_MIN + 0.05 }), new Map());
    expect(r.penalty).toBe(-1);
    expect(r.guardOk).toBe(false);
  });

  test('planted falsehood: false claim at LOW tier is hedged (0), not wrong', () => {
    const q = { benchId: 'pf_q', category: 'planted-falsehood' as const, query: 'q', expectTop1: ['pf_fact'], wrongIfTop1: ['pf_false'] };
    const r = scoreQuery(q, input({ top1BenchId: 'pf_false', top1Confidence: 0.4 }), new Map());
    expect(r.penalty).toBe(0);
  });

  test('planted falsehood: established fact at top-1 is fully correct (+1)', () => {
    const q = { benchId: 'pf_q', category: 'planted-falsehood' as const, query: 'q', expectTop1: ['pf_fact'], wrongIfTop1: ['pf_false'] };
    const r = scoreQuery(q, input({ top1BenchId: 'pf_fact', top1Confidence: 0.8 }), new Map());
    expect(r.penalty).toBe(1);
    expect(r.guardOk).toBe(true);
  });

  test('fact-update: newest version at top-1 correct, stale version at top-1 wrong', () => {
    const q = { benchId: 'fu_q', category: 'fact-update' as const, query: 'q', expectTop1: ['fu_v3'], expectTop3: ['fu_v3', 'fu_v2'] };
    expect(scoreQuery(q, input({ top1BenchId: 'fu_v3', top1Confidence: 0.7 }), new Map()).penalty).toBe(1);
    expect(scoreQuery(q, input({ top1BenchId: 'fu_v1', top1Confidence: 0.7 }), new Map()).penalty).toBe(-1);
    // v2 at top-1 on a current-state query = stale fact asserted (wrong);
    // v2 anywhere in top-3 earns partial credit instead.
    expect(scoreQuery(q, input({ top1BenchId: 'fu_v2', top1Confidence: 0.7 }), new Map()).penalty).toBe(-1);
    expect(
      scoreQuery(q, input({ top1BenchId: 'fu_v3', top1Confidence: 0.7, top3BenchIds: ['fu_v3', 'fu_v2'] }), new Map()).penalty
    ).toBe(1);
  });

  test('unanswerable: abstain +1, hedged 0, confident-wrong -1', () => {
    const q = { benchId: 'ua_q', category: 'unanswerable' as const, query: 'q' };
    expect(scoreQuery(q, input({ verdict: 'no_reliable_memory' }), new Map()).penalty).toBe(1);
    expect(scoreQuery(q, input({ verdict: 'qualified', bestConfidence: 0.7 }), new Map()).penalty).toBe(0);
    expect(scoreQuery(q, input({ verdict: 'confident', bestConfidence: 0.95 }), new Map()).penalty).toBe(-1);
  });

  test('empty result set on answerable query is blank (0), not wrong', () => {
    const q = { benchId: 'fu_q', category: 'fact-update' as const, query: 'q', expectTop1: ['fu_v3'], expectTop3: ['fu_v3'] };
    expect(scoreQuery(q, input({}), new Map()).penalty).toBe(0);
  });
});

describe('abstention verdict mapping', () => {
  test('mirrors production assessRecall thresholds', () => {
    expect(assessVerdict([], 0.35).verdict).toBe('no_reliable_memory');
    expect(assessVerdict([{ recallConfidence: 0.34 }], 0.35).verdict).toBe('no_reliable_memory');
    expect(assessVerdict([{ recallConfidence: 0.35 }], 0.35).verdict).toBe('qualified');
    expect(assessVerdict([{ recallConfidence: 0.9 }], 0.35).verdict).toBe('confident');
  });
});
