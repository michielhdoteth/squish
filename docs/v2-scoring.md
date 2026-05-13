# Importance Scoring v2 and Contradiction Detection v2

## Overview

This module implements the v2 scoring system based on research showing 3-factor scoring + LLM-as-Validator achieves 95%+ accuracy.

## Components

### 1. Importance Scoring v2 (`core/scoring/importance-v2.ts`)

Implements 3-factor importance scoring:

```
Final Score = 0.5 * baseImportance + 0.3 * surprise + 0.2 * emotion
```

**Factors:**
- `baseImportance` (0-1): From existing v1 scoring system, normalized
- `surprise` (0-1): Measures unexpectedness/contradiction with existing memories
- `emotion` (0-1): Detects urgent/high-stakes content

**Weights:** Configurable via the `weights` parameter (default: 0.5, 0.3, 0.2)

### 2. Contradiction Detection v2 (`core/consolidation/contradiction-v2.ts`)

Implements LLM-as-Validator pattern for contradiction detection.

**Features:**
- Keyword-based detection (fallback, no LLM required)
- LLM-based detection (when `useLLM=true`, falls back to keyword if LLM unavailable)
- Batch checking for multiple memories
- Configurable via `SQUISH_V2_CONTRADICTION_CHECK` environment variable

**Target Accuracy:** 95%+

## Usage

### Importance v2 in Memory Write Path

The v2 scoring is integrated into `core/memory/memories.ts`. When creating a new memory:

1. v1 importance is calculated (legacy system)
2. v2 factors are computed:
   - `baseImportance`: Normalized v1 score
   - `surprise`: Detected by comparing with existing memories
   - `emotion`: Detected from urgent/important keywords
3. Final score uses v2 if significantly different, otherwise falls back to v1

### Contradiction Detection

```typescript
import { detectContradictionLLM, checkContradictions } from '../consolidation/contradiction-v2.js';

// Single comparison
const result = await detectContradictionLLM(
  { id: 'mem-1', content: 'yes' },
  { id: 'mem-2', content: 'no' },
  false // useLLM
);

// Check against existing memories
const contradictions = await checkContradictions(
  { id: 'new-mem', content: 'yes', projectId: 'proj-1' },
  false // useLLM
);
```

## Configuration

Add to `config/settings.json` or use environment variables:

```json
{
  "features": {
    "enableV2ContradictionCheck": true
  }
}
```

Or set environment variable:
```bash
export SQUISH_V2_CONTRADICTION_CHECK=true
```

## Testing

```bash
bun test tests/core/scoring/importance-v2.test.ts
bun test tests/core/consolidation/contradiction-v2.test.ts
```

## Future Enhancements

1. **LLM Integration**: Implement actual LLM calls in `detectContradictionLLM` when API is available
2. **Better Surprise Detection**: Use semantic similarity instead of keyword matching
3. **Dynamic Weights**: Adjust weights based on memory type or user feedback
4. **Confidence Scoring**: Add confidence intervals to all predictions
