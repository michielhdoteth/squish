# Squish Benchmark Results

## LoCoMo Dataset Results (22 Questions)

**Date:** 2026-01-30  
**Provider:** Squish (with mock memory store)  
**Judge:** Local string-matching  
**Dataset:** LoCoMo (22 questions, 3 sessions)

### Summary

| Metric | Value |
|--------|-------|
| Total Questions | 22 |
| Answered | 22 |
| Correct | 4 |
| **Accuracy** | **18.2%** |
| Avg Latency | 0ms |
| Total Time | 0.2s |

### Comparison with Other Systems

| System | Benchmark | Accuracy |
|--------|-----------|----------|
| **Supermemory** | LongMemEval | **81.6%** |
| **Squish (mock)** | LoCoMo | **18.2%** |
| Typical RAG | Memory benchmarks | 40-60% |

### Individual Question Results

**Correct Answers (4/22):**
1. ✓ "Who is helping with the second location and when?" (Maria's brother Carlos, Coral Gables, March 2025)
2. ✓ "What is Dr. Chen's son's name and age?" (David, 8 years old)
3. (2 more with partial credit)

**Main Failure Modes:**
- Simple keyword matching struggles with:
  - Multi-hop reasoning ("Who works where and with whom?")
  - Temporal reasoning ("When did X happen?")
  - Entity relationships ("Name all students...")

## Limitations of Current Test

1. **Using Mock Provider**: The current test uses a simple in-memory Map instead of actual Squish:
   - No vector similarity search
   - No semantic understanding
   - No embedding-based retrieval

2. **Local Judge**: Using simple string matching instead of LLM judge:
   - Misses semantic equivalence ("Alex" vs "the user")
   - Doesn't handle paraphrasing
   - Strict keyword requirements

3. **Answer Generation**: Using keyword extraction instead of LLM:
   - Can't synthesize information from multiple sources
   - Doesn't handle complex queries

## Recommendations for Accurate Benchmarking

### 1. Use Actual Squish Core

To get real results, integrate with Squish's actual memory system:

```typescript
import { rememberMemory, searchMemories } from '../squish/core/memory/memories.js';
```

### 2. Use LLM Judge

Set up proper API keys for accurate evaluation:

```bash
# .env.local
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
# or  
HF_TOKEN=hf_...
```

### 3. Run with Real Models

```bash
# Local model (Ollama)
bun run src/index.ts run -p squish -b locomo -m llama3.2 -j llama3.2

# Hugging Face
bun run src/index.ts run -p squish -b locomo -m hf:mistralai/Mistral-7B-Instruct-v0.2
```

### 4. Download Full Datasets

```bash
# Full LoCoMo (500+ questions)
# Download from: https://github.com/locomo-benchmark/locomo

# LongMemEval (Supermemory's benchmark)
# Download from: https://github.com/supermemoryai/longmemeval
```

## Next Steps

1. **Connect to Real Squish**: Update provider to use actual `searchMemories()` function
2. **Add Embeddings**: Test with OpenAI/Ollama embeddings
3. **Compare with Mem0/Zep**: Add other providers for comparison
4. **Run Full LongMemEval**: Test against Supermemory's reported 81.6%

## Expected Improvements with Real Integration

With proper Squish integration:
- **Vector search** should improve recall significantly
- **Semantic similarity** should capture meaning beyond keywords
- **Multi-hop reasoning** via memory associations

Target: 60-80% accuracy on LoCoMo to be competitive with Supermemory.
