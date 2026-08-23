/**
 * Golden-set retrieval evaluation harness.
 *
 * Seeds an isolated temp SQLite DB with the golden corpus (real embeddings
 * pipeline as configured), runs every query through the production SDK
 * surface (`SquishClient.search`, with `SquishClient.recall` routing captured
 * as diagnostics), and reports Recall@5 / MRR / HitRate@1 per category and
 * overall. Exit code 1 when a threshold is breached so this can gate flag
 * flips and retrieval changes.
 *
 * Run: bun tests/golden/run-eval.ts [--out <path>] [--top-k <n>] [--quiet]
 *
 * Deterministic + offline: temp data dir, local TF-IDF embeddings fallback,
 * fixed staggered created_at timestamps, no network providers.
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GoldenMemory {
  id: string;
  type: string;
  tags: string[];
  content: string;
}

export interface GoldenQuery {
  id: string;
  category: QueryCategory;
  query: string;
  mustHit: string[];
  mayHit: string[];
}

export interface GoldenSet {
  meta: Record<string, unknown>;
  memories: GoldenMemory[];
  queries: GoldenQuery[];
}

export type QueryCategory = 'paraphrase' | 'entity' | 'temporal' | 'negation' | 'procedural' | 'multi-hop';

export const QUERY_CATEGORIES: QueryCategory[] = [
  'paraphrase',
  'entity',
  'temporal',
  'negation',
  'procedural',
  'multi-hop',
];

// ─── Thresholds (env-overridable; gate flag flips) ─────────────────────────

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_THRESHOLDS = {
  recallAt5: 0.85,
  mrr: 0.82,
  hitAt1: 0.78,
};

export function getThresholds() {
  return {
    recallAt5: numEnv('GOLDEN_MIN_RECALL5', DEFAULT_THRESHOLDS.recallAt5),
    mrr: numEnv('GOLDEN_MIN_MRR', DEFAULT_THRESHOLDS.mrr),
    hitAt1: numEnv('GOLDEN_MIN_HIT1', DEFAULT_THRESHOLDS.hitAt1),
  };
}

// ─── Pure helpers (unit-tested in golden-set.test.ts) ──────────────────────

/** Load + structurally validate the golden set JSON. Throws on violation. */
export function loadGoldenSet(path: string): GoldenSet {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as GoldenSet;
  const ids = new Set<string>();
  for (const mem of raw.memories) {
    if (!mem.id || ids.has(mem.id)) throw new Error(`Duplicate or missing memory id: ${mem.id}`);
    ids.add(mem.id);
    if (!mem.content?.trim()) throw new Error(`Memory ${mem.id} has empty content`);
    if (!Array.isArray(mem.tags)) throw new Error(`Memory ${mem.id} tags must be an array`);
  }
  if (raw.memories.length < 50) throw new Error(`Corpus too small: ${raw.memories.length} (< 50)`);

  const qIds = new Set<string>();
  for (const q of raw.queries) {
    if (!q.id || qIds.has(q.id)) throw new Error(`Duplicate or missing query id: ${q.id}`);
    qIds.add(q.id);
    if (!QUERY_CATEGORIES.includes(q.category)) throw new Error(`Query ${q.id} invalid category: ${q.category}`);
    if (!q.query?.trim()) throw new Error(`Query ${q.id} has empty text`);
    if (!Array.isArray(q.mustHit) || q.mustHit.length === 0 || q.mustHit.length > 3) {
      throw new Error(`Query ${q.id} mustHit must be 1..3 ids`);
    }
    for (const id of [...(q.mustHit ?? []), ...(q.mayHit ?? [])]) {
      if (!ids.has(id)) throw new Error(`Query ${q.id} references unknown memory id: ${id}`);
    }
    for (const id of q.mustHit ?? []) {
      if ((q.mayHit ?? []).includes(id)) throw new Error(`Query ${q.id}: ${id} in both mustHit and mayHit`);
    }
  }
  return raw;
}

/**
 * Rank-of-first-hit metrics against a ranked list of retrieved golden IDs.
 * - recallAtK: |mustHit ∩ topK| / |mustHit|
 * - rr: 1/rank of first result in mustHit (0 if none in list)
 * - hitAt1: rank-1 result belongs to mustHit
 */
export function scoreRanking(
  rankedIds: string[],
  mustHit: string[],
  k = 5,
): { recallAtK: number; rr: number; hitAt1: boolean } {
  const must = new Set(mustHit);
  const topK = rankedIds.slice(0, k).filter((id) => must.has(id));
  const recallAtK = topK.length / must.size;

  let rr = 0;
  for (let i = 0; i < rankedIds.length; i++) {
    if (must.has(rankedIds[i])) {
      rr = 1 / (i + 1);
      break;
    }
  }

  const hitAt1 = rankedIds.length > 0 && must.has(rankedIds[0]);
  return { recallAtK, rr, hitAt1 };
}

interface CategoryAggregate {
  count: number;
  recallAt5: number;
  mrr: number;
  hitAt1: number;
}

export function aggregate(
  scored: Array<{ category: string; recallAtK: number; rr: number; hitAt1: boolean }>,
): { overall: Omit<CategoryAggregate, 'count'> & { count: number }; byCategory: Record<string, CategoryAggregate> } {
  const byCategory: Record<string, CategoryAggregate> = {};
  let sumR = 0, sumRR = 0, sumH1 = 0;

  for (const s of scored) {
    byCategory[s.category] ??= { count: 0, recallAt5: 0, mrr: 0, hitAt1: 0 };
    const agg = byCategory[s.category];
    agg.count += 1;
    agg.recallAt5 += s.recallAtK;
    agg.mrr += s.rr;
    agg.hitAt1 += s.hitAt1 ? 1 : 0;
    sumR += s.recallAtK;
    sumRR += s.rr;
    sumH1 += s.hitAt1 ? 1 : 0;
  }

  for (const agg of Object.values(byCategory)) {
    agg.recallAt5 /= agg.count;
    agg.mrr /= agg.count;
    agg.hitAt1 /= agg.count;
  }

  const n = scored.length || 1;
  return {
    overall: { count: scored.length, recallAt5: sumR / n, mrr: sumRR / n, hitAt1: sumH1 / n },
    byCategory,
  };
}

function shortGitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// ─── Harness ────────────────────────────────────────────────────────────────

async function seedCorpus(goldenSet: GoldenSet, dataDir: string) {
  const { SquishClient } = await import('../../packages/sdk/src/index.js');
  const { getDb } = await import('../../db/index.js');

  const client = new SquishClient();
  const uuidToGolden = new Map<string, string>();

  for (const mem of goldenSet.memories) {
    const stored = await client.remember(mem.content, {
      type: mem.type as any,
      tags: mem.tags,
      metadata: { goldenId: mem.id },
    });
    uuidToGolden.set(stored.id, mem.id);
  }

  // Deterministic recency ordering: rewrite created_at to fixed hourly steps
  // in corpus order so run-to-run wall-clock jitter cannot flip near-ties.
  // Stored as ISO-8601 TEXT (SQLite dynamic typing) because the vector-search
  // read path stringifies raw values and the SDK mapper requires a
  // Date-parseable representation; epoch integers would crash it.
  const db = await getDb();
  const sqlite = (db as any)?.$client;
  if (!sqlite || typeof sqlite.prepare !== 'function') {
    throw new Error('Expected SQLite client for eval harness');
  }
  const update = sqlite.prepare('UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?');
  const baseMs = Date.UTC(2026, 0, 1);
  let i = 0;
  for (const [uuid] of uuidToGolden) {
    const iso = new Date(baseMs + i * 3600_000).toISOString();
    update.run(iso, iso, uuid);
    i += 1;
  }

  return { client, uuidToGolden, dataDir };
}

function padCell(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  );
  const line = widths.map((w) => '-'.repeat(w + 2)).join('+');
  console.log(widths.map((w, i) => ` ${padCell(headers[i], w)} `).join('|'));
  console.log(line);
  for (const row of rows) {
    console.log(widths.map((w, i) => ` ${padCell(String(row[i] ?? ''), w)} `).join('|'));
  }
  console.log(line);
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const outPath = flag('--out') ?? join(__dirname, 'baseline-report.json');
  const topK = Number(flag('--top-k') ?? 10);
  const quiet = argv.includes('--quiet');

  const startedAt = Date.now();

  // Isolated offline environment BEFORE importing any product module.
  const dataDir = mkdtempSync(join(tmpdir(), 'squish-golden-eval-'));
  process.env.SQUISH_DATA_DIR = dataDir;
  process.env.DATABASE_URL = '';
  delete process.env.SQUISH_DATABASE_URL;
  process.env.SQUISH_EMBEDDINGS_PROVIDER ||= 'local'; // repo default; TF-IDF fallback keeps it offline

  const goldenPath = join(__dirname, 'golden-set.json');
  const goldenSet = loadGoldenSet(goldenPath);

  const { client, uuidToGolden } = await seedCorpus(goldenSet, dataDir);

  const perQuery: Array<Record<string, unknown>> = [];
  const scored: Array<{ category: string; recallAtK: number; rr: number; hitAt1: boolean }> = [];

  for (const q of goldenSet.queries) {
    // Production retrieval surface.
    const results = await client.search(q.query, { limit: topK });
    const rankedGoldenIds = results
      .map((r: any) => uuidToGolden.get((r as any)?.memory?.id ?? r?.id))
      .filter((id: string | undefined): id is string => Boolean(id));

    // Diagnostics only: which strategy the recall router picks for this query.
    let recallStrategy: string | null = null;
    try {
      const recalled = await client.recall(q.query, { limit: 3 });
      recallStrategy = recalled.routing?.strategy ?? null;
    } catch {
      recallStrategy = 'error';
    }

    const s = scoreRanking(rankedGoldenIds, q.mustHit, 5);
    scored.push({ category: q.category, ...s });
    perQuery.push({
      id: q.id,
      category: q.category,
      query: q.query,
      mustHit: q.mustHit,
      mayHit: q.mayHit,
      retrieved: results.map((r: any) => ({
        goldenId: uuidToGolden.get((r as any)?.memory?.id ?? r?.id) ?? null,
        score: Number(((r as any)?.score ?? 0).toFixed(4)),
      })),
      recallStrategy,
      ...s,
    });
  }

  const { overall, byCategory } = aggregate(scored);
  const thresholds = getThresholds();
  const breaches: string[] = [];
  if (overall.recallAt5 < thresholds.recallAt5) breaches.push(`recallAt5 ${overall.recallAt5.toFixed(3)} < ${thresholds.recallAt5}`);
  if (overall.mrr < thresholds.mrr) breaches.push(`mrr ${overall.mrr.toFixed(3)} < ${thresholds.mrr}`);
  if (overall.hitAt1 < thresholds.hitAt1) breaches.push(`hitAt1 ${overall.hitAt1.toFixed(3)} < ${thresholds.hitAt1}`);

  const durationMs = Date.now() - startedAt;

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      gitSha: shortGitSha(),
      corpusSize: goldenSet.memories.length,
      queryCount: goldenSet.queries.length,
      topK,
      embeddingsProvider: process.env.SQUISH_EMBEDDINGS_PROVIDER,
      durationMs,
      deterministic: true,
    },
    thresholds,
    overall,
    byCategory,
    queries: perQuery,
  };

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), JSON.stringify(report, null, 2));

  if (!quiet) {
    console.log('\n=== Golden Retrieval Eval ===');
    console.log(`corpus=${goldenSet.memories.length} queries=${goldenSet.queries.length} topK=${topK} provider=${process.env.SQUISH_EMBEDDINGS_PROVIDER} runtime=${durationMs}ms`);

    console.log('\n-- Overall --');
    printTable(
      ['Metric', 'Value', 'Threshold'],
      [
        ['Recall@5', overall.recallAt5.toFixed(3), `>= ${thresholds.recallAt5}`],
        ['MRR', overall.mrr.toFixed(3), `>= ${thresholds.mrr}`],
        ['HitRate@1', overall.hitAt1.toFixed(3), `>= ${thresholds.hitAt1}`],
      ],
    );

    console.log('\n-- By Category --');
    printTable(
      ['Category', 'N', 'Recall@5', 'MRR', 'HitRate@1'],
      Object.entries(byCategory)
        .sort((a, b) => a[1].recallAt5 - b[1].recallAt5)
        .map(([cat, a]) => [cat, String(a.count), a.recallAt5.toFixed(3), a.mrr.toFixed(3), a.hitAt1.toFixed(3)]),
    );

    const worst = [...scored]
      .map((s, i) => ({ ...s, q: goldenSet.queries[i], rank: s.rr > 0 ? 1 / s.rr : Infinity }))
      .filter((s) => !s.hitAt1)
      .slice(0, 12);
    if (worst.length > 0) {
      console.log('\n-- Queries without a rank-1 must-hit (worst offenders) --');
      for (const w of worst) {
        console.log(`  ${w.q.id.padEnd(18)} first-must-rank=${Number.isFinite(w.rank) ? w.rank : 'miss'} :: ${w.q.query.slice(0, 64)}`);
      }
    }
  }

  console.log(`\nreport written to ${resolve(outPath)}`);

  // Best-effort cleanup; SQLite handles can stay locked on Windows briefly.
  try {
    const { closeAllDbs } = await import('../../db/index.js');
    await closeAllDbs();
  } catch {
    // ignore
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    console.warn(`note: could not remove temp dir ${dataDir}`);
  }

  if (breaches.length > 0) {
    console.error(`\nEVAL FAILED - threshold breach: ${breaches.join('; ')}`);
    process.exit(1);
  }
  console.log('EVAL PASSED');
}

// Run only when executed directly (not when imported by tests).
const isDirectRun =
  typeof Bun !== 'undefined'
    ? import.meta.main
    : process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await main();
}
