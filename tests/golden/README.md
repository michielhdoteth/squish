# Golden-Set Retrieval Eval

Measurement instrument for the retrieval overhaul. Everything else in the plan
is judged by these numbers, so treat changes here as carefully as product code.

## Layout

| File | Purpose |
|------|---------|
| `golden-set.json` | Fixture corpus (60 memories, fictional "Helios Research Lab" content) + 46 graded queries. Fixed IDs (`golden_001`...), fully deterministic. |
| `run-eval.ts` | Harness: seeds an isolated temp SQLite DB via the real write path, runs every query through `SquishClient.search` exactly as production does, computes metrics, writes the report, exits nonzero on threshold breach. |
| `baseline-report.json` | Committed canonical baseline captured under the **pinned eval env** (see below). This is the reference point for retrieval changes. |
| `reports/` | Committed ablation/breach artifacts that document flag decisions (e.g. `temporal-validity-on-breach.json`). |

## Run

```bash
bun run eval                    # writes tests/golden/baseline-report.json by default
bun tests/golden/run-eval.ts --out /tmp/report.json --top-k 10 --quiet
```

Runtime is a few seconds. No network access is required or performed: the
harness pins `SQUISH_EMBEDDINGS_PROVIDER=local` (repo default), which uses the
offline TF-IDF fallback unless a local model is explicitly configured.

### Pinned environment (canonical baselines)

The default env is PINNED so baselines are identical across hosts regardless
of warm caches or ambient config. Each variable is set only when unset in the
environment (mirroring the `--real-model` pattern):

| Variable | Pinned to | Why |
|----------|-----------|-----|
| `SQUISH_RERANKER_ENABLED` | `false` | The cross-encoder applies silently when a host has a warm HF cache -> machine-dependent scores. |
| `SQUISH_QUERY_EXPANSION` | `true` | Production default; deterministic (rule-based) so it is pinned explicitly rather than left ambient. |
| `SQUISH_GRAPH_BOOST_LEGACY` | `false` | Pins normalized graph boost (Batch 5 default) explicitly. |
| `SQUISH_TEMPORAL_VALIDITY` | `false` | Gated off after a golden-eval breach (see `reports/temporal-validity-on-breach.json`). |
| `SQUISH_SCORING_V2` | `true` | Pins v2 three-field serving explicitly. |

Two opt-outs exist:

```bash
bun tests/golden/run-eval.ts --precision-stack   # ablation: PRODUCTION defaults (reranker ON etc.)
bun tests/golden/run-eval.ts --real-model        # additionally enables the bundled embedding model
```

Never use `--precision-stack` output as a baseline; it exists to quantify what
the precision stack adds/removes relative to the pinned gate.

### Report provenance

Each report's `meta` records `gitSha` (branch tip at run time) and `gitDirty`
(whether uncommitted changes existed). A report generated from a dirty working
tree describes exactly that state - regenerate baselines as the LAST step
before committing so the committed report matches the committed code.

## Metrics

Each query declares:

- `mustHit` — 1..3 memories that directly answer the query. Verifiable against
  corpus text: if a memory does not literally contain the answer, it cannot be
  a mustHit.
- `mayHit` — up to 5 related memories worth surfacing but not required.

Retrieval returns ranked results; result UUIDs are mapped back to golden IDs
via the `metadata.goldenId` stored at seed time.

| Metric | Definition |
|--------|-----------|
| **Recall@5** | Mean over queries of \|mustHit ∩ top5\| / \|mustHit\|. |
| **MRR** | Mean of 1/rank of the first must-hit result in the ranking (0 if none). |
| **HitRate@1** | Fraction of queries where the rank-1 result belongs to mustHit. |

All three are reported per category (`paraphrase`, `entity`, `temporal`,
`negation`, `procedural`, `multi-hop`) and overall. The report JSON includes
per-query retrieved lists and scores for debugging misses.

## Baseline (pinned env, TF-IDF fallback embeddings)

Overall: Recall@5 **0.935**, MRR **0.904**, HitRate@1 **0.870** (identical to
the pre-pinning numbers on this host; pinning guarantees they hold everywhere).
Weakest categories: **negation** ("do we still use X" conflict handling, hit@1
0.625) and **paraphrase** (lexical-gap queries like "which package manager won
out?" miss the pnpm decision entirely). These are the known TF-IDF-era defects
the overhaul should attack; see `baseline-report.json` for per-query detail.

### Flag-decision artifacts (`reports/`)

- `temporal-validity-on-breach.json` - eval run with
  `SQUISH_TEMPORAL_VALIDITY=true`: recall@5 0.837, MRR 0.809, HitRate@1 0.739,
  breaching all three gates. This is the committed evidence for keeping the
  flag OFF by default. The `notes` field inside documents reproduction steps
  and diagnosis (flat staleness penalty too blunt on aged corpora).

Known harness-discovered defect: raw epoch integers crashed the SDK result
mapper on the vector-search read path (`core/memory/vector-search.ts`), so the
harness originally seeded ISO-8601 text into `created_at`/`updated_at`. Batch
6b fix: ALL temporal columns (`created_at`, `updated_at`, `last_decay_at`) are
now seeded in the same consistent ISO format - mixed formats made
`computeRetention`'s anchor go NaN and silently collapsed the freshness factor
to a constant 1.0 (inert signal). The retention module itself was also
hardened to parse Date/epoch-seconds/epoch-ms/ISO robustly and to log+fallback
instead of silently returning full retention on unparseable dates.

## Freshness ablation (Batch 6b)

Each run reports an ablation note in the report's `calibration.freshnessAblation`
and prints freshness-on vs freshness-off ECE/Brier. The off-state reruns the
identical deterministic retrieval with `SQUISH_EVIDENCE_FRESHNESS=off`, which
nulls the freshness evidence signal. First honest numbers after the fix:
freshness-on ECE 0.0413 / Brier 0.1139 vs freshness-off ECE 0.0304 / Brier
0.1148 - i.e. the previously reported 0.0304 was measured while the signal was
inert. The ECE gate applies to the freshness-on (canonical) numbers.

## Threshold gating

The harness exits **0** only when overall metrics meet the thresholds; exit
**1** otherwise. Defaults live in `DEFAULT_THRESHOLDS` in `run-eval.ts` and can
be overridden per invocation:

```bash
GOLDEN_MIN_RECALL5=0.65 GOLDEN_MIN_MRR=0.5 GOLDEN_MIN_HIT1=0.4 bun run eval
```

How to use this when flipping retrieval flags:

1. Run `bun run eval` before the change; confirm it matches (or deliberately
   re-baseline) `baseline-report.json`.
2. Apply the change/flag flip.
3. Re-run. Overall metrics must stay at or above thresholds, AND no category
   may regress sharply (compare against baseline-report's category table).
   Improvements justify raising thresholds in the same PR.
4. Commit an updated report alongside any intentional threshold change so the
   gate stays honest.

## Determinism notes

- Fresh temp data dir per run; nothing touches `~/.squish`.
- `created_at` timestamps are rewritten to fixed hourly steps after seeding, so
  recency boosts cannot flip near-ties between runs.
- TF-IDF hashing embeddings are pure functions of text.
- Query routing (regex-based) and graph extraction are deterministic given the
  corpus.
- The precision stack is pinned (reranker off, expansion on, normalized graph
  boost, temporal validity off, v2 serving) so warm HF caches or ambient env
  cannot change results between hosts; see "Pinned environment" above.

## Changing the dataset

Add memories with the next free `golden_NNN` id; add queries referencing them
with explicit `mustHit` grounded in the memory text. `tests/golden/golden-set.test.ts`
validates structural integrity (unique ids, resolvable references, category
coverage) on every test run. If you change expectations, regenerate and commit
the report in the same change.
