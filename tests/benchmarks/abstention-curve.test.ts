/**
 * Abstention-curve aggregation integrity tests (Task B3).
 *
 * The abstention floor must be chosen FROM DATA, so the math that turns a
 * bench report into a risk/coverage row and the policy that picks the
 * recommended threshold are verified here against synthetic reports.
 * Pure functions only: no subprocesses, no DB, no fixtures — fast by design.
 */

import { describe, test, expect } from 'bun:test';
import {
  aggregateCurveRow,
  selectionConstraints,
  selectRecommendedThreshold,
  REFERENCE_THRESHOLD,
  COVERAGE_FRACTION_OF_MAX,
  MACRO_TOLERANCE,
  type BenchReportLike,
} from '../../scripts/lib/abstention-aggregate.js';

describe('aggregateCurveRow', () => {
  // Spec case: one confident-wrong answer, one correct abstain.
  const miniReport: BenchReportLike = {
    overall: { count: 2, macroPenaltyScore: 0.0, microPenaltyScore: 0.0, confidentWrong: 1 },
    byCategory: {
      unanswerable: { penaltyScore: 0.0 },
      'fact-update': { penaltyScore: 1 },
    },
    perQuery: [
      { benchId: 'ua_q1', category: 'unanswerable', penalty: -1, verdict: 'confident' },
      { benchId: 'ua_q2', category: 'unanswerable', penalty: 1, verdict: 'no_reliable_memory' },
    ],
  };

  test('mini-report: coverage / CWR / P(wrong|confident) / selectiveScore math', () => {
    const row = aggregateCurveRow(miniReport, 0.35);
    expect(row.threshold).toBe(0.35);
    expect(row.totalQueries).toBe(2);
    expect(row.answeredQueries).toBe(1);
    expect(row.coverage).toBe(0.5); // 1 of 2 answered
    expect(row.confidentWrong).toBe(1);
    expect(row.confidentCount).toBe(1);
    expect(row.cwr).toBe(0.5); // 1 wrong / 2 total
    expect(row.pWrongGivenConfident).toBe(1); // 1 wrong / 1 confident
    expect(row.selectiveScore).toBe(-1); // mean penalty over ANSWERED only (the -1)
    expect(row.macro).toBe(0);
    expect(row.unanswerablePenalty).toBe(0);
  });

  test('qualified verdict counts as answered; denominators stay honest', () => {
    const row = aggregateCurveRow(
      {
        overall: { macroPenaltyScore: 0.2 },
        perQuery: [
          { verdict: 'confident', penalty: -1 },   // confident-wrong
          { verdict: 'confident', penalty: 0.6 },  // confident but correct
          { verdict: 'qualified', penalty: 0.5 },  // hedged answer still counts as coverage
        ],
      },
      0.4
    );
    expect(row.coverage).toBe(1); // every non-abstaining verdict answers
    expect(row.confidentCount).toBe(2);
    expect(row.confidentWrong).toBe(1);
    expect(row.cwr).toBe(0.3333); // 1 wrong of 3 total, rounded
    expect(row.pWrongGivenConfident).toBe(0.5); // 1 wrong of 2 confident
    expect(row.selectiveScore).toBe(0.0333); // mean(-1, 0.6, 0.5) over ANSWERED queries
  });

  test('all-abstain curve point degrades to zeros, never NaN', () => {
    const row = aggregateCurveRow(
      { overall: {}, perQuery: [{ verdict: 'no_reliable_memory', penalty: 1 }] },
      0.8
    );
    expect(row.coverage).toBe(0);
    expect(row.cwr).toBe(0);
    expect(row.pWrongGivenConfident).toBe(0); // zero confident answers: defined 0, not NaN
    expect(row.selectiveScore).toBe(0); // nothing answered: neutral, not NaN
  });

  test('missing report sections degrade to zeros, never NaN', () => {
    const row = aggregateCurveRow({}, 0.3);
    expect(row.totalQueries).toBe(0);
    expect(row.coverage).toBe(0);
    expect(row.macro).toBe(0);
    expect(row.micro).toBe(0);
    expect(row.unanswerablePenalty).toBe(0);
  });

  test('values are rounded to 4 decimals for deterministic output', () => {
    const row = aggregateCurveRow(
      { perQuery: [{ verdict: 'qualified', penalty: 1 }, { verdict: 'no_reliable_memory', penalty: 1 }] },
      0.45
    );
    expect(row.coverage).toBe(0.5);
    const third = aggregateCurveRow(
      { perQuery: [{ verdict: 'qualified', penalty: 1 }, { verdict: 'qualified', penalty: 1 }, { verdict: 'no_reliable_memory', penalty: 1 }] },
      0.45
    );
    expect(third.coverage).toBe(0.6667); // 2/3 rounded, not floating-point noise
  });
});

describe('selectRecommendedThreshold', () => {
  test('policy constants are the spec values', () => {
    expect(REFERENCE_THRESHOLD).toBe(0.35);
    expect(COVERAGE_FRACTION_OF_MAX).toBe(0.85);
    expect(MACRO_TOLERANCE).toBe(0.03);
  });

  test('selectionConstraints derive floors from the curve', () => {
    const rows = [
      { threshold: 0.30, coverage: 1.0, macro: 0.52, cwr: 0.10 },
      { threshold: 0.35, coverage: 0.98, macro: 0.50, cwr: 0.08 },
    ] as any[];
    const c = selectionConstraints(rows);
    expect(c.minCoverage).toBe(0.85); // 0.85 x max(1.0)
    expect(c.macroFloor).toBeCloseTo(0.47, 6); // 0.50 - 0.03
  });

  test('monotone tradeoff: picks 0.45, rejects lower-CWR rows that break a constraint', () => {
    // CWR improves monotonically with threshold, but:
    //   0.50 breaks the macro floor (0.44 < 0.47) and
    //   0.60 breaks the coverage floor (0.80 < 0.85).
    const curve = [
      { threshold: 0.30, coverage: 1.00, cwr: 0.10, macro: 0.52 },
      { threshold: 0.35, coverage: 0.98, cwr: 0.08, macro: 0.50 },
      { threshold: 0.40, coverage: 0.95, cwr: 0.06, macro: 0.49 },
      { threshold: 0.45, coverage: 0.92, cwr: 0.02, macro: 0.48 },
      { threshold: 0.50, coverage: 0.88, cwr: 0.01, macro: 0.44 }, // macro fails
      { threshold: 0.60, coverage: 0.80, cwr: 0.00, macro: 0.40 }, // coverage fails
    ] as any[];
    const chosen = selectRecommendedThreshold(curve);
    expect(chosen).not.toBeNull();
    expect(chosen!.threshold).toBe(0.45);
    expect(chosen!.cwr).toBe(0.02);
  });

  test('flat CWR tie-breaks on higher macro, then least aggressive floor', () => {
    const flatCwr = [
      { threshold: 0.30, coverage: 0.96, cwr: 0.037, macro: 0.22 },
      { threshold: 0.55, coverage: 0.90, cwr: 0.037, macro: 0.25 },
      { threshold: 0.60, coverage: 0.89, cwr: 0.037, macro: 0.26 },
      { threshold: 0.70, coverage: 0.89, cwr: 0.037, macro: 0.26 },
    ] as any[];
    // 0.60 and 0.70 tie on CWR and macro: least aggressive floor wins.
    expect(selectRecommendedThreshold(flatCwr)!.threshold).toBe(0.60);

    const macroTieBreak = [
      { threshold: 0.30, coverage: 0.96, cwr: 0.037, macro: 0.26 },
      { threshold: 0.60, coverage: 0.89, cwr: 0.037, macro: 0.28 },
    ] as any[];
    expect(selectRecommendedThreshold(macroTieBreak)!.threshold).toBe(0.60);
  });

  test('returns null when every row violates a constraint or the curve is empty', () => {
    expect(selectRecommendedThreshold([])).toBeNull();

    // Reference row (0.35) missing -> macro floor undefined -> only coverage applies.
    const noRef = [
      { threshold: 0.30, coverage: 0.90, cwr: 0.05, macro: 0.10 },
    ] as any[];
    expect(selectRecommendedThreshold(noRef)!.threshold).toBe(0.30);

    // Every row violates one constraint: 0.35 sets a high macro floor but
    // fails coverage itself; the other rows fail macro.
    const allFail = [
      { threshold: 0.30, coverage: 1.00, cwr: 0.09, macro: 0.50 }, // macro 0.50 < floor 0.57
      { threshold: 0.35, coverage: 0.80, cwr: 0.05, macro: 0.60 }, // floor 0.57; coverage 0.80 < 0.85
      { threshold: 0.60, coverage: 0.90, cwr: 0.01, macro: 0.56 }, // macro 0.56 < floor 0.57
    ] as any[];
    expect(selectRecommendedThreshold(allFail)).toBeNull();
  });
});
