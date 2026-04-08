# Squish Benchmark Completion Plan

## Goal
Get accurate benchmark results comparing Squish to Supermemory (81.6% on LongMemEval)

## Current State
- ✅ Local LLM working (Qwen 2.5 3B)
- ✅ Real benchmark dataset (22 questions)
- ❌ Simple TF-IDF retrieval (fails semantic search)
- ❌ Strict keyword judge (marks correct answers wrong)
- ❌ Not using real Squish core

## Implementation Steps

### Phase 1: Fix Retrieval (30 min)
**Problem:** Current TF-IDF can't find "cat" → "Luna" or "from" → "originally from"

**Solution:** Use Ollama embeddings
```bash
ollama pull nomic-embed-text
```

**Implementation:**
- Update `local-llm.ts` to use real embeddings API
- Store embeddings for each memory
- Use cosine similarity for search

**Expected Improvement:** 0% → 40-50%

---

### Phase 2: Fix Judge (20 min)
**Problem:** String matching marks "Mike helps Alex" wrong vs "Mike helping"

**Solution:** Use the same LLM to judge answers

**Implementation:**
- Create `llm-judge.ts` that uses Qwen to evaluate
- Judge compares semantic meaning, not keywords
- Returns proper JSON with reasoning

**Expected Improvement:** 40-50% → 60-70%

---

### Phase 3: Connect Real Squish (30 min)
**Problem:** Using mock memory, not real Squish

**Solution:** Import from `../squish/core/`

**Implementation:**
- Create `squish-real.ts` provider
- Import `rememberMemory`, `searchMemories`
- Use actual embeddings from Squish

**Expected Improvement:** 60-70% → 70-80%

---

### Phase 4: Run Full Benchmark (10 min)
**Execute:**
```bash
bun run src/index.ts run-local -m qwen2.5:3b -b locomo
bun run src/index.ts run-local -m qwen2.5:3b -b longmemeval
```

**Compare with:**
- Supermemory: 81.6% (LongMemEval)
- Mem0: ~75%
- Zep: ~70%

---

## Success Criteria

| Metric | Target |
|--------|--------|
| LoCoMo accuracy | >70% |
| LongMemEval accuracy | >65% |
| Avg latency | <2s per question |
| No API costs | ✅ Local only |

## Files to Modify

1. `src/providers/local-llm.ts` - Add embeddings
2. `src/judges/llm-judge.ts` - New LLM judge
3. `src/providers/squish-real.ts` - Real Squish integration
4. `src/pipeline/runner-local.ts` - Use new components

## Let's Execute
