# Squish Benchmark Results

> Warning: this file contains older benchmark snapshots from before the retrieval-vs-QA methodology split.
> For current benchmark rules, use `benchmark/METHODOLOGY.md` and fresh runs from `benchmark/run.ts`.

## Hero Number

**66.67% LOCOMO with local embeddings only -- no memory LLM required.**

This is the real, reproducible score. Squish achieves this using:
- Local TF-IDF embeddings (768-dim, hashed n-grams)
- Hybrid search (semantic + BM25 keyword + RRF)
- Geometry-aware consolidation (safety test before compression)
- Global memory store (~/.squish/)

No API calls. No second LLM. No per-token costs.

## All Modes

| Mode | Score | Setup |
|------|-------|-------|
| **Squish Local** (retrieval-only) | **66.67%** | Keyword matching. Lenient: any keyword match = correct. |
| **Squish + LLM** (deepseek-chat + v4-pro) | **65.08%** | Extractive QA. LLM extracts exact answer from retrieved context. |
| Squish Max Mode | Not yet run | LLM + reranker + higher recall |

## Methodology

- **Benchmark**: LoCoMo (Long-term Conversational Memory)
- **Dataset**: 10 conversations, 60 questions across 5 categories
- **Mode**: Retrieval-only with keyword matching (for local mode)
- **Embeddings**: Local TF-IDF (no neural embeddings)
- **Top-K**: 8
- **No LLM**: Zero LLM calls during storage, retrieval, or scoring
- **Trace export**: Each question has a full JSON trace in `traces/`

## How to Read the Numbers

Both benchmarks use the **same Squish storage and retrieval pipeline** (2000-char chunks, session timestamps). Only the scoring differs:

- **Squish Local** (66.67%): Keyword matching. Checks if answer words appear anywhere in retrieved context. Lenient by design.

- **Squish + LLM** (65.08%): Extractive QA. The LLM must extract the exact answer from retrieved context. Harder test. Uses `deepseek-chat` for extraction and `deepseek-v4-pro` for judging.

The LLM score MATCHES the keyword baseline, confirming the pipeline is correct. The LLM does not degrade recall.

**Important**: Initially the LLM scored 41% because `deepseek-v4-flash` (a reasoning model) was used for answering. Reasoning models output thinking before the answer, which confuses extractive benchmarks. Switching to `deepseek-chat` (non-reasoning) fixed the issue. Always use non-reasoning models for benchmark answerers.

## Per-Category Breakdown (Local Mode)

| Category | Score |
|----------|-------|
| Single-hop | 95.65% |
| Temporal | 100.00% |
| Open-domain | 100.00% |
| Multi-hop | 36.67% |
| **Overall** | **66.67%** |

## MemoryScope Architecture

Squish now uses a single global `~/.squish/squish.db` for all projects.
Project awareness is handled via auto-detection from working directory:

```
SQUISH_WORKING_DIRECTORY=/path/to/project  # Canonical env var
```

When no `SQUISH_WORKING_DIRECTORY` is set, Squish falls back to `INIT_CWD` then `process.cwd()`. The `--project` flag remains available as an explicit override.

## Performance

| Metric | Result |
|--------|--------|
| LoCoMo Score | **66.67%** (no LLM) |
| Embedding Latency | 1-5ms |
| API Latency | 1-20ms |
| Default Cost | $0 local runtime |
| Local-first | Yes |
| Setup | 1 command (`npm install -g squish-memory`) |
| API keys | Not required for the default path |
| Storage | Single `~/.squish/squish.db` |
