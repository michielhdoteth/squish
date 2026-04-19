# Squish Benchmark Results

**Date:** 2026-03-18  
**Environment:** Windows x64, Node v24.3.0, Bun  
**Local models:** qwen2.5:0.5b, qwen2.5:3b, nomic-embed-text

---

## Summary

| Test | Result | Notes |
|------|--------|-------|
| **LoCoMo Memory** | **77%** | Real test with 22 questions |
| Package Size | **283 KB** | Dry-run package measurement |
| Security Checks | **Passed** | Rate limiting, CORS, parameterized queries |
| Stress Test | **943 ops/sec** | 50 concurrent operations, all successful |
| Web API Latency | **1-20ms** | GET endpoints on local web runtime |

---

## 1. LoCoMo Memory Benchmark

**Dataset:** [Snap Research LoCoMo](https://github.com/snap-research/locomo)  
**Model:** qwen2.5:0.5b via local runtime  
**Method:** semantic retrieval + answer generation + answer judging

### Results

| Metric | Value |
|--------|-------|
| **Overall Score** | **77%** |
| Correct | 12/22 |
| Partial | 10/22 |
| Incorrect | 0/22 |

All question types avoided incorrect answers in this run. Partial scores indicate the relevant context was retrieved, but the final answer was incomplete.

### Why This Benchmark Matters

LoCoMo reflects the core Squish use case:
- store conversation and project memory
- retrieve relevant context later
- answer questions about prior state and decisions

---

## 2. Stress And Concurrency Test

### Concurrent Embedding Operations

| Concurrent | Total Ops | Successful | Avg Latency | Throughput |
|------------|-----------|------------|-------------|------------|
| 1 | 1 | 1 | 32ms | 31/s |
| 5 | 5 | 5 | 11ms | 385/s |
| 10 | 10 | 10 | 12ms | 526/s |
| 25 | 25 | 25 | 20ms | 862/s |
| **50** | **50** | **50** | **35ms** | **943/s** |

### Rate Limiting Check

| Total Requests | 200 OK | 429 Rate Limited | Errors |
|---------------|--------|------------------|--------|
| 120 | 86 | 34 | 0 |

This confirms the configured request throttling is active during load.

---

## 3. Web API Performance

### GET Endpoints (`squish run web`)

| Endpoint | Status | Latency | Size |
|----------|--------|---------|------|
| `/api/health` | 200 | 20ms | 398 B |
| `/api/projects` | 200 | 2ms | 201 B |
| `/api/memories` | 200 | 3ms | 2.1 KB |
| `/api/memories?limit=5` | 200 | 2ms | 2.1 KB |
| `/api/context` | 200 | 1ms | 353 B |
| `/` | 200 | 2ms | 23.8 KB |

**Average GET latency:** 5ms

---

## 4. Security Checks

| Check | Status | Details |
|-------|--------|---------|
| Rate Limiting | Pass | 100 req/15min configured |
| CORS | Pass | localhost-only by default |
| Query Safety | Pass | parameterized ORM queries |
| Secret Hygiene | Pass | secret scan script present |
| Env Handling | Pass | `.env.example` provided |

Built-in protections verified during this run:
- web server rate limiting
- local-only default CORS posture
- dependency audit with no direct user-risk issue called out in runtime code

---

## 5. Package Metrics

| Metric | Value |
|--------|-------|
| Package Size | 283 KB |
| Production Dependencies | 24 |
| Development Dependencies | 10 |
| Peer Dependencies | 0 |

This package footprint comes from the published runtime bundle rather than a source checkout.

---

## 6. Benchmark Commands

```bash
# LoCoMo memory benchmark (requires local model runtime)
node scripts/benchmark/03-locomo-real.mjs

# Package metrics
bun run scripts/benchmark/05-package-metrics.mjs

# Security check
bun run scripts/benchmark/06-security-check.mjs

# Stress test (requires local runtime + squish run web)
node scripts/benchmark/11-stress-test.mjs

# Web API test (requires squish run web)
node scripts/benchmark/04-web-api-full.mjs
```

---

## 7. What These Results Mean

- Squish can run fully local memory retrieval with a measured LoCoMo score of 77%.
- The local runtime stays fast for common API reads and concurrent embedding work.
- The shipped package remains small enough for lightweight installation paths.
- The benchmark results reflect a local-first setup, not hosted inference or managed storage.

---

## 8. Benchmark Limits

These results describe one measured environment and should be read accordingly:
- model choice affects answer quality
- hardware affects throughput and latency
- benchmark datasets capture only part of real-world agent memory behavior

For release decisions, the most useful signals are consistency, reproducibility, and local runtime behavior rather than any single benchmark score.
