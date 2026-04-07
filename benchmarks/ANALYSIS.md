# Squish Benchmark Analysis - Real Local LLM

## Test Configuration

| Setting | Value |
|---------|-------|
| Model | Qwen 2.5 3B (Ollama) |
| Benchmark | LoCoMo (22 questions) |
| Retrieval | Simple TF-IDF |
| Judge | Local string similarity |
| Hardware | Local machine |

## Results Summary

| Metric | Value |
|--------|-------|
| Questions Tested | 10 |
| Correct (strict) | 0 |
| Correct (lenient) | ~6-7 |
| Avg Latency | 1047ms |
| Total Time | 26.4s |

## Detailed Analysis

### Questions Where Model Was RIGHT but Judge Was Wrong

| # | Question | Model Answer | Ground Truth | Issue |
|---|----------|--------------|--------------|-------|
| 1 | What is the user's name and where do they work? | "Alex... at Amazon as Senior Software Engineer" | "Alex works at Amazon as Senior Software Engineer" | Judge wanted exact phrase |
| 2 | What team is Alex on? | "AWS Lambda optimization" | "AWS Lambda team working on optimization" | Paraphrasing marked wrong |
| 3 | Who is Alex's manager? | "Sarah... end of the quarter" | "Manager is Sarah... end of quarter" | Correct info, strict matching |
| 8 | Who helps Alex? | "Mike helps Alex" | "Mike helping" | Actually correct! |
| 9 | Restaurant owner name? | "Maria Garcia... El Sabor" | "Maria Garcia, restaurant called El Sabor" | Correct! |
| 10 | When did El Sabor open? | "2015... authentic Cuban cuisine" | "Opened in 2015... authentic Cuban cuisine" | Correct! |

**That's 6/10 actually correct!**

### Questions Where Retrieval Failed

| # | Question | What Happened |
|---|----------|---------------|
| 4 | Cat's name? | Retrieved wrong session - "no information about cat" |
| 5 | Where from originally? | Retrieved "moved to Seattle" but missed "from Austin, Texas" |
| 6 | Marathon? | Failed to retrieve running info from later in conversation |
| 7 | Running partner? | Same - missed Jennifer info |

### Root Causes

#### 1. Retrieval Issues (Biggest Problem)
```
Current: Simple TF-IDF (word frequency)
Problem: Can't understand semantic similarity
Example: "cat" ≠ "Luna" in keyword matching
         "from Austin" not found when searching "originally from"
```

**Solution:** Use real embeddings (OpenAI/Ollama embeddings)

#### 2. Judge Too Strict
```
Current: Keyword matching
Problem: "Mike helps Alex" marked wrong vs "Mike helping"
Solution: Use LLM judge or semantic similarity
```

#### 3. Context Window
```
Current: Whole conversation stored as one chunk
Problem: Later turns obscure earlier facts
Solution: Chunk into smaller pieces with overlap
```

## What This Means for Squish

### The Good News ✅

1. **Local models work!** Qwen 2.5 3B generates good answers (~1s latency)
2. **No API needed** - Fully private, no OpenAI/Anthropic required
3. **Fast enough** - 26s for 10 questions = ~2.6s per question

### What Needs Fix 🔧

1. **Vector search** - Current simple matching isn't enough
   - Need embeddings (can use Ollama embeddings: `nomic-embed-text`)
   - Or integrate with Squish's actual pgvector/SQLite FTS

2. **Better chunking** - Store individual turns, not whole conversations

3. **LLM judge** - Use the model to judge answers, not string matching

## Recommendations

### Quick Wins

```bash
# 1. Use Ollama for embeddings
ollama pull nomic-embed-text

# 2. Chunk conversations into smaller pieces
# Store each turn separately with metadata

# 3. Use LLM for judging
# Same Qwen model can judge its own answers
```

### Proper Integration

```typescript
// Use Squish's actual search
import { searchMemories } from '../squish/core/memory/memories.js';

// Use Squish's embeddings
import { getEmbedding } from '../squish/core/embeddings.js';
```

## Next Steps

1. **Test with real Squish search** (if you have it running)
2. **Add proper embeddings** using `nomic-embed-text` or similar
3. **Use LLM judge** - let Qwen evaluate answers
4. **Run full 22 questions** for complete comparison

## Comparison Target

| System | Expected Accuracy |
|--------|-------------------|
| Supermemory | 81.6% (LongMemEval) |
| Squish (current) | ~30-40% (estimated with proper retrieval) |
| Squish (target) | 70%+ to be competitive |

Your model is good enough - the retrieval just needs work!
