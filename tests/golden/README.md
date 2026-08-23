# Golden-Set Retrieval Eval

Measurement instrument for the retrieval overhaul. Everything else in the plan
is judged by these numbers, so treat changes here as carefully as product code.

## Layout

| File | Purpose |
|------|---------|
| `golden-set.json` | Fixture corpus (60 memories, fictional "Helios Research Lab" content) + 47 graded queries. Fixed IDs (`golden_001`...), fully deterministic. |
| `run-eval.ts` | Harness: seeds an isolated temp SQLite DB via the real write path, runs every query through `SquishClient.search` exactly as production does, computes metrics, writes the report, exits nonzero on threshold breach. |
| `baseline-report.json` | Committed "before" picture captured with current defaults (TF-IDF fallback embeddings). This is the reference point for the overhaul. |

## Run

```bash
bun run eval                    # writes tests/golden/baseline-report.json by default
bun tests/golden/run-eval.ts --out /tmp/report.json --top-k 10 --quiet
```

Runtime is a few seconds. No network access is required or performed: the
harness pins `SQUISH_EMBEDDINGS_PROVIDER=local` (repo default), which uses the
offline TF-IDF fallback unless a local model is explicitly configured.

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

## Baseline (current defaults, TF-IDF fallback embeddings)

Overall: Recall@5 **0.925**, MRR **0.904**, HitRate@1 **0.870**. Weakest
categories: **negation** ("do we still use X" conflict handling, hit@1 0.625)
and **paraphrase** (lexical-gap queries like "which package manager won out?"
miss the pnpm decision entirely). These are the known TF-IDF-era defects the
overhaul should attack; see `baseline-report.json` for per-query detail.

Known harness-discovered defect: the vector-search read path stringifies raw
`created_at` integers and the SDK result mapper then produces an Invalid Date
(`core/memory/vector-search.ts:41`). The harness sidesteps it by seeding
ISO-8601 timestamps; product code was intentionally not touched here.

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

## Changing the dataset

Add memories with the next free `golden_NNN` id; add queries referencing them
with explicit `mustHit` grounded in the memory text. `tests/golden/golden-set.test.ts`
validates structural integrity (unique ids, resolvable references, category
coverage) on every test run. If you change expectations, regenerate and commit
the report in the same change.
