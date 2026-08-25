# Importance Scoring v2 and Contradiction Detection v2

## Overview

This module implements the v2 scoring system based on research showing 3-factor scoring + LLM-as-Validator achieves 95%+ accuracy.

## Components

### 1. Importance Scoring v2 (`core/memory/importance.ts`)

Implements 3-factor importance scoring:

```
Final Score = 0.5 * baseImportance + 0.3 * surprise + 0.2 * emotion
```

**Factors:**
- `baseImportance` (0-1): From existing v1 scoring system, normalized
- `surprise` (0-1): Measures unexpectedness/contradiction with existing memories
- `emotion` (0-1): Detects urgent/high-stakes content

**Weights:** Configurable via the `weights` parameter (default: 0.5, 0.3, 0.2)

### 2. Contradiction Detection v2 (`core/memory/contradiction-resolver.ts`)

Implements the LLM-as-Validator pattern for contradiction detection.

**Features:**
- Keyword opposite-pair detection (Scenario 7 heuristic, no LLM required)
- Proposition-aware LLM validation via the private `llmValidateSupersession` helper (vetoes confident heuristic false positives, degrades gracefully to heuristics when the LLM is unavailable)
- Batch checking against existing project memories
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
import { detectContradictions, hasOppositeKeywords } from '../memory/contradiction-resolver.js';

// Pure keyword opposite-pair check (no DB access)
hasOppositeKeywords('it works', 'it is broken'); // true

// Check a new memory against existing project memories
const result = await detectContradictions({
  newContent: 'yes',
  newType: 'fact',
  projectId: 'proj-1'
});
// result.hasContradiction / result.supersededMemories / result.confidence
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
bun test tests/core/memory/importance-three-factor.test.ts
bun test tests/core/memory/contradiction-resolver-llm.test.ts
```

## Future Enhancements

1. **LLM Integration**: Implement actual LLM calls in `detectContradictionLLM` when API is available
2. **Better Surprise Detection**: Use semantic similarity instead of keyword matching
3. **Dynamic Weights**: Adjust weights based on memory type or user feedback
4. **Confidence Scoring**: Add confidence intervals to all predictions
