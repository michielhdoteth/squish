/**
 * Pure aggregation for the abstention-floor sweep (Task B3).
 *
 * Turns one memory-bench report (produced at a given SQUISH_ABSTAIN_BELOW
 * threshold) into a single risk/coverage row, and picks the recommended
 * threshold from a full curve. No I/O, no subprocesses, fully deterministic —
 * imported by both scripts/abstention-curve.ts and its integrity test.
 *
 * Definitions per threshold t:
 *   answered             verdict !== 'no_reliable_memory'
 *   coverage             |answered| / total
 *   confidentWrong       verdict === 'confident' AND penalty <= -0.5
 *   cwr                  confidentWrong / total          (headline CWR)
 *   pWrongGivenConfident confidentWrong / |confident|
 *   selectiveScore       mean penalty over ANSWERED queries only
 *   macro / micro        from the bench report's overall block
 *   unanswerable         byCategory['unanswerable'].penaltyScore
 */

/** Loose shape of the memory-bench report JSON we aggregate. */
export interface BenchReportLike {
  overall?: { macroPenaltyScore?: number; microPenaltyScore?: number; confidentWrong?: number };
  byCategory?: Record<string, { penaltyScore?: number }>;
  perQuery?: Array<{ verdict?: string; penalty?: number; category?: string }>;
}

export interface CurveRow {
  threshold: number;
  totalQueries: number;
  answeredQueries: number;
  coverage: number;
  confidentWrong: number;
  confidentCount: number;
  cwr: number;
  pWrongGivenConfident: number;
  selectiveScore: number;
  macro: number;
  micro: number;
  unanswerablePenalty: number;
}

/** Selection policy constants (exported so the script can print them). */
export const REFERENCE_THRESHOLD = 0.35;
export const COVERAGE_FRACTION_OF_MAX = 0.85;
export const MACRO_TOLERANCE = 0.03;

function round4(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
}

/**
 * Aggregate one bench report into a curve row for the given threshold.
 * Empty/absent fields degrade to neutral zeros, never NaN.
 */
export function aggregateCurveRow(report: BenchReportLike, threshold: number): CurveRow {
  const queries = report.perQuery ?? [];
  const total = queries.length;

  let answered = 0;
  let confidentCount = 0;
  let confidentWrong = 0;
  let answeredPenaltySum = 0;
  for (const q of queries) {
    const verdict = q.verdict ?? 'no_reliable_memory';
    const penalty = typeof q.penalty === 'number' ? q.penalty : 0;
    if (verdict !== 'no_reliable_memory') {
      answered += 1;
      answeredPenaltySum += penalty;
      if (verdict === 'confident') {
        confidentCount += 1;
        if (penalty <= -0.5) confidentWrong += 1;
      }
    }
  }

  return {
    threshold,
    totalQueries: total,
    answeredQueries: answered,
    coverage: round4(total > 0 ? answered / total : 0),
    confidentWrong,
    confidentCount,
    cwr: round4(total > 0 ? confidentWrong / total : 0),
    pWrongGivenConfident: round4(confidentCount > 0 ? confidentWrong / confidentCount : 0),
    selectiveScore: round4(answered > 0 ? answeredPenaltySum / answered : 0),
    macro: round4(report.overall?.macroPenaltyScore ?? 0),
    micro: round4(report.overall?.microPenaltyScore ?? 0),
    unanswerablePenalty: round4(report.byCategory?.unanswerable?.penaltyScore ?? 0),
  };
}

export interface SelectionConstraints {
  /** coverage >= this fraction of the curve's max coverage. */
  minCoverage: number;
  /** macro >= macro(reference) - tolerance, or null when reference row missing. */
  macroFloor: number | null;
}

/**
 * Derive the selection constraints from a curve: keep at least
 * COVERAGE_FRACTION_OF_MAX of the max-coverage point and do not drop more
 * than MACRO_TOLERANCE below the macro score at REFERENCE_THRESHOLD.
 */
export function selectionConstraints(rows: CurveRow[]): SelectionConstraints {
  if (rows.length === 0) return { minCoverage: 0, macroFloor: null };
  const maxCoverage = Math.max(...rows.map((r) => r.coverage));
  const ref = rows.find((r) => r.threshold === REFERENCE_THRESHOLD);
  return {
    minCoverage: round4(maxCoverage * COVERAGE_FRACTION_OF_MAX),
    macroFloor: ref === undefined ? null : round4(ref.macro - MACRO_TOLERANCE),
  };
}

/**
 * Pick the recommended threshold: among rows satisfying both constraints,
 * minimize CWR. Deterministic tie-breaks for the common case where CWR is
 * flat across the curve (confident-wrong answers sit in the HIGH tier, so
 * sub-0.90 floors cannot remove them):
 *   1. higher macro — equal measured risk earns the better overall score,
 *      which is where raised-floor abstention quality shows up;
 *   2. lower threshold — among indistinguishable points, take the least
 *      aggressive floor (smallest behavioral change).
 * Returns null when no row satisfies the constraints (caller should then
 * recommend keeping the current floor rather than guessing).
 */
export function selectRecommendedThreshold(rows: CurveRow[]): CurveRow | null {
  if (rows.length === 0) return null;
  const { minCoverage, macroFloor } = selectionConstraints(rows);
  const candidates = rows.filter((r) => {
    if (r.coverage < minCoverage) return false;
    // A missing reference row makes the macro constraint vacuous: skip it.
    if (macroFloor !== null && r.macro < macroFloor) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => a.cwr - b.cwr || b.macro - a.macro || a.threshold - b.threshold
  );
  return candidates[0];
}
