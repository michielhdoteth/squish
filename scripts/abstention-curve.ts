/**
 * Abstention-floor risk/coverage sweep (Task B3).
 *
 * Sweeps SQUISH_ABSTAIN_BELOW across thresholds, runs the memory bench once
 * per threshold in an isolated subprocess, and aggregates each report into a
 * risk/coverage row:
 *
 *   coverage              share of queries answered (verdict != abstain)
 *   CWR                   confident-wrong rate over ALL queries (headline)
 *   P(wrong|confident)    confident-wrong rate among confident answers
 *   selectiveScore        mean penalty over ANSWERED queries only
 *   macro / unanswerable  overall macro penalty / abstention category score
 *
 * The recommended floor minimizes CWR subject to two guardrails:
 *   - coverage >= 0.85 x the max-coverage point on the curve
 *   - macro >= macro(0.35) - 0.03   (no quality sacrificed for reliability theater)
 *
 * The DEFAULT_ABSTAIN_BELOW flip itself happens only after human review of
 * this curve; this script measures and recommends, it does not decide.
 *
 * Run:  bun scripts/abstention-curve.ts
 * Writes: tests/benchmarks/reports/abstention-curve.json
 * Deterministic + offline: bench subprocesses inherit the same pinned env the
 * bench applies internally (this script only overrides SQUISH_ABSTAIN_BELOW).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateCurveRow,
  selectRecommendedThreshold,
  selectionConstraints,
  REFERENCE_THRESHOLD,
  COVERAGE_FRACTION_OF_MAX,
  MACRO_TOLERANCE,
  type BenchReportLike,
  type CurveRow,
} from './lib/abstention-aggregate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const THRESHOLDS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80];
const REPORT_PATH = join(ROOT, 'tests', 'benchmarks', 'reports', 'abstention-curve.json');

function shortGitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function runBenchAtThreshold(threshold: number, outPath: string): void {
  execFileSync(
    'bun',
    ['scripts/run-memory-bench.ts', '--out', outPath, '--quiet'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, SQUISH_ABSTAIN_BELOW: String(threshold) },
    }
  );
}

function padCell(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = widths.map((w) => '-'.repeat(w + 2)).join('+');
  console.log(widths.map((w, i) => ` ${padCell(headers[i], w)} `).join('|'));
  console.log(line);
  for (const row of rows) console.log(widths.map((w, i) => ` ${padCell(String(row[i] ?? ''), w)} `).join('|'));
  console.log(line);
}

function fmt(value: number, digits = 4): string {
  return value.toFixed(digits);
}

async function main() {
  const startedAt = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), 'squish-abstain-curve-'));
  const rows: CurveRow[] = [];

  try {
    for (const t of THRESHOLDS) {
      const outPath = join(tmp, `bench-${t.toFixed(2)}.json`);
      process.stdout.write(`[curve] threshold=${t.toFixed(2)} running bench...`);
      runBenchAtThreshold(t, outPath);
      const report: BenchReportLike = JSON.parse(readFileSync(outPath, 'utf-8'));
      rows.push(aggregateCurveRow(report, t));
      process.stdout.write(` done\n`);
    }
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Windows file-lock after subprocess exit; non-fatal.
    }
  }

  // Comparison table sorted by threshold.
  console.log('\n=== ABSTENTION FLOOR RISK/COVERAGE CURVE ===');
  printTable(
    ['threshold', 'coverage', 'CWR', 'P(wrong|confident)', 'selectiveScore', 'macro', 'unanswerable'],
    [...rows]
      .sort((a, b) => a.threshold - b.threshold)
      .map((r) => [
        r.threshold.toFixed(2),
        fmt(r.coverage),
        fmt(r.cwr),
        fmt(r.pWrongGivenConfident),
        fmt(r.selectiveScore),
        fmt(r.macro),
        fmt(r.unanswerablePenalty),
      ])
  );

  // Recommendation.
  const constraints = selectionConstraints(rows);
  const chosen = selectRecommendedThreshold(rows);
  console.log('\n=== RECOMMENDATION ===');
  console.log(
    `constraints: coverage >= ${fmt(constraints.minCoverage)} (${COVERAGE_FRACTION_OF_MAX} x max coverage)` +
      ` AND macro >= ${constraints.macroFloor === null ? 'n/a' : fmt(constraints.macroFloor)}` +
      ` (${REFERENCE_THRESHOLD} macro - ${MACRO_TOLERANCE})`
  );
  if (chosen === null) {
    console.log('chosen threshold: NONE satisfies both constraints.');
    console.log(
      `action: keep current floor at ${REFERENCE_THRESHOLD} and investigate before raising.`
    );
  } else {
    console.log(`chosen threshold: ${chosen.threshold.toFixed(2)}`);
    console.log(
      `  CWR=${fmt(chosen.cwr)} P(wrong|confident)=${fmt(chosen.pWrongGivenConfident)}` +
        ` coverage=${fmt(chosen.coverage)} selectiveScore=${fmt(chosen.selectiveScore)}` +
        ` macro=${fmt(chosen.macro)} unanswerable=${fmt(chosen.unanswerablePenalty)}`
    );
    console.log(
      'reasoning: minimizes CWR subject to both constraints;' +
        ' ties broken on higher macro, then the least aggressive floor.'
    );
    console.log('NOTE: default floor stays unchanged until human review of this curve.');
  }

  // Machine-readable artifact.
  const artifact = {
    meta: {
      name: 'squish-abstention-curve',
      gitSha: shortGitSha(),
      generatedAt: new Date().toISOString(),
      runtimeMs: Date.now() - startedAt,
      thresholds: THRESHOLDS,
      constraints: {
        referenceThreshold: REFERENCE_THRESHOLD,
        coverageFractionOfMax: COVERAGE_FRACTION_OF_MAX,
        macroTolerance: MACRO_TOLERANCE,
        minCoverage: constraints.minCoverage,
        macroFloor: constraints.macroFloor,
      },
    },
    recommendation: chosen === null ? { chosenThreshold: null } : {
      chosenThreshold: chosen.threshold,
      cwr: chosen.cwr,
      pWrongGivenConfident: chosen.pWrongGivenConfident,
      coverage: chosen.coverage,
      selectiveScore: chosen.selectiveScore,
      macro: chosen.macro,
      unanswerablePenalty: chosen.unanswerablePenalty,
    },
    rows: [...rows].sort((a, b) => a.threshold - b.threshold),
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`\nreport: ${REPORT_PATH}\n`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[abstention-curve] FAILED:', err);
    process.exit(1);
  });
}
