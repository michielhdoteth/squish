# Squish Benchmark Results

## v1.2.3 vs v2.0 Comparison

### LoCoMo (No LLM)
| Category | v1.2.3 | v2.0 | Change |
|----------|---------|-------|--------|
| Overall | 68.33% | 67.32% | -1.01% |
| Single-hop | 91.49% | 90.07% | -1.42% |
| Multi-hop | 60.44% | 60.75% | +0.31% |
| Temporal | 84.38% | 82.29% | -2.09% |
| Open-domain | 97.74% | 95.96% | -1.78% |
| Common-sense | 0.45% | 0.45% | 0% |

### LongMemEval (No LLM)
| Category | v1.2.3 | v2.0 | Change |
|----------|---------|-------|--------|
| Overall | 68.00% | 60.00% | -8.00% |
| Temporal-reasoning | 68.33% | 73.33% | +5.00% |
| Multi-session | 35.00% | 40.00% | +5.00% |

### LoCoMo (With LLM)
| Category | v2.0 | Notes |
|----------|-------|-------|
| Overall | 43.33% | LLM: google/gemma-4b |
| Single-hop | 78.26% | |
| Multi-hop | 20.00% | Needs improvement |
| Temporal | 60.00% | |
| Open-domain | 100.00% | |
| Common-sense | 0.00% | No LLM context |

## Analysis

### Improvements in v2.0
1. **LongMemEval Temporal-reasoning**: +5% (68.33% → 73.33%)
2. **LongMemEval Multi-session**: +5% (35% → 40%)
3. **Graph boost implemented** (BFS traversal)
4. **Ebbinghaus decay** (biologically accurate)
5. **Consolidation engine** (DBSCAN clustering)

### Regressions in v2.0
1. **LongMemEval Overall**: -8% (68% → 60%)
   - Cause: Graph boost too high (fixed: weight 1.5 → 0.2)
   - Cause: Multi-session detection too aggressive (fixed)
2. **LoCoMo Open-domain**: -1.78% (97.74% → 95.96%)

### Next Steps
1. Fix graph boost weight (done: 1.5 → 0.2)
2. Fix multi-session detection (done)
3. Re-run benchmarks to verify fixes
4. Improve multi-hop reasoning (currently 20% with LLM)
