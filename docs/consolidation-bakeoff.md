# Consolidation Bake-off (Batch 8)

Four overlapping consolidation pipelines existed in parallel. This document
records the empirical evaluation, the decision, and what was deleted.

## Candidates

| Key | System | Entry point | Schedule (was) |
|-----|--------|-------------|----------------|
| a | GAC geometry-aware (`core/memory/consolidation.ts` + `core/clustering/**`) | `consolidateMemories()` via `weekly_consolidation` job | weekly |
| b | Sleep-cycle DBSCAN (`core/consolidation/engine.ts`) | `runSleepCycle()` via `consolidation_sleep` job | daily |
| c | SimHash dedup (root `core/consolidation.ts`) | `runDeduplicationJob()` via `auto_maintenance` step | nightly dry-run / weekly real |
| d | LLM consolidator (`core/consolidation/llm-consolidator.ts`) | `runLLMConsolidation()` via `llm_consolidation` job | daily |
| e | sleep-consolidation (`core/memory/sleep-consolidation.ts`) | none (dark code) | never wired |

## Method

`scripts/consolidation-bakeoff.ts` seeds an isolated temp SQLite DB with a
25-memory corpus containing ground truth:

- 3 topic groups x 4 paraphrased variants each (21 true duplicate pairs total,
  including a verbatim duplicate trio)
- 1 adversarial contradiction pair: high lexical overlap, OPPOSITE meaning
  ("Redis stays as the session cache" vs "Redis was removed ... for the
  session cache"). Merging these is a correctness failure.
- 6 unrelated singletons
- Tags are deliberately noisy (synonym vocabularies: db/database/postgres,
  choices/decisions, ...) because that is what live captures look like.

Each candidate ran through its real production entry point against the same
corpus, LLM disabled (deterministic, offline), embeddings from the default
local TF-IDF provider. Deleted candidates are re-measured through verbatim
vendored copies of their pure layers so the bake-off stays reproducible.

## Results

| candidate | clusters | correct pairs | incorrect pairs | adversarial grouped | singleton hit | source-marking | undo | destructive writes |
|---|---|---|---|---|---|---|---|---|
| (a) GAC @ production 0.7 | 0 | 0 | **0** | no | no | n/a (nothing met threshold) | yes (`reverseConsolidation`) | 0 |
| (a') GAC @ tuned 0.45    | 1 | 3 | **0** | no | no | yes (`metadata.consolidatedFrom` + `isConsolidated`) | yes | 3 |
| (a') GAC @ aggressive 0.30 | 2 | 9 | **0** | no | no | yes | yes | 7 |
| (b) Sleep-cycle DBSCAN   | 0 | 0 | 0 | n/a | n/a | mergedIntoId only; promotions carry no source ids | no | 0 |
| (c) SimHash dedup        | 3 | 14 | **141** | **yes** | **yes** | associations only; auto-merge wrote a nonexistent column | no | 17 status flips |
| (d) LLM consolidator     | 0 (no-op) | 0 | 0 | no | no | non-destructive | n/a | 0 |

## Findings

### (c) SimHash dedup: deleted - unsafe AND broken
- On short texts, 64-bit SimHash saturates: cross-topic pairs scored
  0.86-0.94 similarity, far above the 0.85 duplicate threshold. The detector
  produced **141 incorrect pairs against 14 correct** (91% wrong), grouped the
  adversarial contradiction pair, and swallowed singletons.
- Its auto-merge path (`autoMergeDuplicates`) writes column `mergedInto`,
  which does not exist in the schema (`mergedIntoId`). Drizzle ignores the
  unknown key inside a try/catch: memories were left `status='merged'` with
  **no merge pointer** - orphaned records, unrecoverable by design.
- It bypassed the KEEP-forever dedup workflow (`core/algorithms`: three-stage
  exact/SimHash+MinHash/embedding detection -> proposals ->
  approve/reject/reverse with `memory_merge_history`). Everything it attempted
  already exists there, with safety.
- Also removed with it: `computeSimHash`, `findSemanticDuplicates`
  (LLM pass capped at 10 comparisons), `getDeduplicationStats`,
  `runFullConsolidationJob`, and `tests/core/consolidation/dedup-llm.test.ts`.
- `runFullMaintenance({'dedup'})` step (and therefore `squish clean` +
  nightly `auto_maintenance`) now routes to
  `handleDetectDuplicates` (proposals only). Executed merges remain gated by
  `SQUISH_DEDUP_AUTO`, threshold, and per-run cap in the nightly
  `dedup_maintenance` job.

### (b) Sleep-cycle DBSCAN: deleted - dead weight
- With realistic tag noise it found **zero clusters** (its only signal is tag
  Jaccard >= 0.8; `findNeighbors` defaults `useEmbeddings=false`). Daily cost,
  zero output.
- When tags DID align (earlier corpus revision) it happily clustered the
  adversarial pair together; its content-overlap merge gate (>= 0.85 word
  Jaccard) is the only thing that saved correctness, and its promotions carry
  no source ids and have no reverse function.
- Fully overlapped by (a), which clusters on embeddings with geometry guards.

### (e) sleep-consolidation.ts: deleted - dark, destructive
- Zero production callers (only its test file imported it). Destructive
  truncation semantics, no scheduler registration, no MCP surface.

### (a) GAC geometry-aware: canonical consolidation
- **Zero incorrect merges at every threshold tested** (0.7 / 0.45 / 0.30).
  The min-cluster-size gate plus geometry strategy selection hold precision
  even when pushed aggressively; recall scales with threshold.
- Source-marking on every output (`metadata.consolidatedFrom`,
  `isConsolidated` flags) and undo via `reverseConsolidation()`. Preserved.
- Honest limitation: at the production similarityThreshold=0.7 with local
  TF-IDF embeddings, paraphrase clusters sit below threshold (measured cosine
  0.38-0.57), so weekly consolidation is conservative on the zero-dependency
  provider. That is acceptable: consolidation is lossy by design and safe >
  sorry. Operators embedding with a real model get full-threshold clustering.

### (d) LLM consolidator: kept - complementary, not overlapping
- Performs zero merges/deletes: writes knowledge edges between existing
  memories plus insight records. Nothing else produces that output
  (bridge-discovery traverses the existing graph; belief extraction happens at
  write time).
- Deterministic no-op without an LLM (measured), and its scheduler job skips
  when `config.llmEnabled` is false. Beliefs it creates route to the
  reflective sector and are governed by belief decay (Batch 6b).

## Scheduler delta

- Removed: `consolidation_sleep` job + handler (+ its default row seed).
- Kept: `weekly_consolidation` (GAC), `llm_consolidation` (LLM-gated),
  `dedup_maintenance` (algorithms proposals + gated auto-merge),
  `auto_maintenance` (dedup step now routes to proposals),
  `deep_maintenance`.

## Reproduce

```bash
bun scripts/consolidation-bakeoff.ts            # human table
bun scripts/consolidation-bakeoff.ts --json     # machine-readable
```
