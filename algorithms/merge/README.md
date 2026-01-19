# Memory Merging Feature

Squish's memory merging system eliminates token bloat by intelligently consolidating duplicate and similar memories while maintaining full auditability and reversibility.

## Overview

The memory merging feature helps you:
- **Stop unbounded memory growth** by consolidating duplicates
- **Preserve information accuracy** with type-specific merge strategies
- **Maintain full control** with user-approval-required workflow
- **Track changes** with complete audit trails
- **Undo merges** with full snapshot restoration

## How It Works

### Two-Stage Detection

The system uses a fast, accurate two-stage detection pipeline:

**Stage 1: Hash-Based Prefiltering** (Fast)
- SimHash: 64-bit fingerprinting detects near-exact duplicates
- MinHash: 128-permutation signatures find fuzzy matches
- Filters large memory sets down to candidates in seconds

**Stage 2: Semantic Ranking** (Accurate)
- Uses embedding vectors (OpenAI, Ollama, or local)
- Calculates cosine similarity on candidates only
- Ranks by confidence level (high/medium/low)

### Merge Workflow

```
1. User calls: detect_duplicate_memories
   ↓
2. System finds candidates using two-stage detection
   ↓
3. Safety checks verify merges are safe
   ↓
4. Merge proposals created (not auto-executed)
   ↓
5. User reviews proposals
   ↓
6. User approves or rejects each proposal
   ↓
7. On approval:
   - Type-specific merge strategy applied
   - Canonical memory created with merged content
   - Original memories marked as merged (soft archive)
   - Full snapshot stored for reversibility
   - Merge history recorded
   ↓
8. User can reverse any merge at any time
```

## MCP Tools

### 1. detect_duplicate_memories

Scans for duplicate/similar memories and creates merge proposals.

**Usage:**
```javascript
await mcp.call('detect_duplicate_memories', {
  projectId: 'project-123',           // Required
  threshold: 0.85,                     // Optional: similarity threshold (0-1)
  memoryType: 'fact',                  // Optional: filter by type
  limit: 50,                           // Optional: max proposals to generate
  autoCreateProposals: true            // Optional: auto-create proposals
})
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "projectId": "...",
    "duplicateCount": 5,
    "proposalsCreated": 4,
    "proposalIds": ["..."],
    "statistics": {
      "totalMemories": 342,
      "candidatesFound": 12,
      "estimatedTokensSaved": 2840
    },
    "timing": {
      "stage1Ms": 245,
      "stage2Ms": 1203,
      "totalMs": 1448
    }
  }
}
```

### 2. list_merge_proposals

Lists pending merge proposals for review.

**Usage:**
```javascript
await mcp.call('list_merge_proposals', {
  projectId: 'project-123',
  status: 'pending',  // Optional: pending|approved|rejected|expired
  limit: 20           // Optional: results per page
})
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "count": 3,
    "proposals": [
      {
        "id": "proposal-456",
        "sourceMemoryIds": ["mem-1", "mem-2"],
        "confidenceLevel": "high",
        "similarityScore": 0.92,
        "mergeReason": "Semantic similarity: 92.0% • Same type (fact) • 100% tag overlap",
        "status": "pending"
      }
    ],
    "byStatus": {
      "pending": 3,
      "approved": 7,
      "rejected": 2,
      "expired": 0
    }
  }
}
```

### 3. preview_merge

Shows what the merged result will look like.

**Usage:**
```javascript
await mcp.call('preview_merge', {
  proposalId: 'proposal-456'
})
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "proposalId": "proposal-456",
    "sourceMemories": [
      { "id": "mem-1", "content": "..." },
      { "id": "mem-2", "content": "..." }
    ],
    "mergedResult": {
      "content": "Consolidated fact text...",
      "summary": "Short summary",
      "tags": ["tag1", "tag2"],
      "metadata": { ... }
    },
    "analysis": {
      "savedTokens": 342,
      "savedPercentage": 28.5,
      "conflictWarnings": []
    }
  }
}
```

### 4. approve_merge

Executes the merge and creates canonical memory.

**Usage:**
```javascript
await mcp.call('approve_merge', {
  proposalId: 'proposal-456',
  reviewNotes: 'Looks good, matches context'  // Optional
})
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "proposalId": "proposal-456",
    "canonicalMemoryId": "mem-canonical-789",
    "mergedMemoryIds": ["mem-1", "mem-2"],
    "tokensSaved": 342,
    "mergedAt": "2024-01-15T10:30:00Z"
  }
}
```

### 5. reject_merge

Rejects a merge proposal without executing it.

**Usage:**
```javascript
await mcp.call('reject_merge', {
  proposalId: 'proposal-456',
  reviewNotes: 'These are actually different contexts'
})
```

### 6. reverse_merge

Undoes a completed merge and restores original memories.

**Usage:**
```javascript
await mcp.call('reverse_merge', {
  mergeHistoryId: 'merge-history-789',
  reason: 'Merged too aggressively'
})
```

### 7. get_merge_stats

Shows project-wide merge statistics and token savings.

**Usage:**
```javascript
await mcp.call('get_merge_stats', {
  projectId: 'project-123'
})
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "projectId": "project-123",
    "totalMemories": 342,
    "mergedMemories": 18,
    "canonicalMemories": 8,
    "pendingProposals": 3,
    "approvedMerges": 47,
    "tokensSaved": {
      "total": 12450,
      "formatted": "12.4k tokens (38.9% of typical recall window)",
      "percentage": 15.2
    },
    "averageMergeSize": 3.2,
    "reversedMerges": 0
  }
}
```

## Merge Strategies Per Type

Each memory type has custom merge semantics:

### Fact
- **Strategy**: Union of all unique facts
- **Behavior**: Combines all statements, deduplicates exact duplicates
- **Example**: "User prefers dark mode" + "User uses VSCode" → Both preserved

### Preference
- **Strategy**: Keep latest preference, note evolution
- **Behavior**: Tracks preference history, warns on conflicts
- **Example**: "Prefers tabs" (old) + "Prefers spaces" (new) → New version, history noted

### Decision
- **Strategy**: Latest decision wins, link to previous
- **Behavior**: Current choice is canonical, previous decisions recorded
- **Example**: "Use React" (old) + "Use Vue" (new) → New choice, previous decisions tracked

### Observation
- **Strategy**: Aggregate observations chronologically
- **Behavior**: Combines observations, preserves temporal patterns
- **Example**: "Code review took 2h" + "Code review took 3h" → "2-3 hour range"

### Context
- **Strategy**: Union of unique context, deduplicate exact matches
- **Behavior**: Combines all context, removes exact duplicates
- **Example**: "Uses TypeScript" (dup) → Single entry

## Safety Checks

Before merging, 8 safety checks run:

| Check | Type | Description |
|-------|------|-------------|
| Immutability | Blocker | Cannot merge memories marked immutable |
| Type Consistency | Blocker | All memories must be same type |
| Already Merged | Blocker | Cannot re-merge previously merged memories |
| Minimum Similarity | Blocker | Similarity must exceed 0.70 |
| Multi-User | Warning | Alerts when merging memories from different users |
| Privacy Mismatch | Warning | Alerts when mixing private/public memories |
| Secrets Detected | Warning | Alerts if memories contain detected secrets |
| Active Status | Blocker | Cannot merge inactive/archived memories |

## Configuration

### Detection Thresholds

```typescript
// Stage 1: Hash-based prefiltering
simhashThreshold: 4,          // Hamming distance (0-64), lower = stricter
minhashThreshold: 0.7,        // Jaccard similarity (0-1), higher = stricter

// Stage 2: Semantic ranking
semanticThreshold: 0.85,      // Cosine similarity (0-1), higher = stricter
```

### Database Mode Differences

| Feature | PostgreSQL | SQLite |
|---------|-----------|--------|
| Full semantic search | Yes | Text-only |
| Vector embeddings | pgvector | JSON storage |
| Detection accuracy | Full (90%+) | Basic (70-80%) |
| Recommended threshold | 0.85 | 0.90+ |

## Token Savings Calculation

Tokens saved = (Source memories tokens) - (Merged memory tokens)

**Simple heuristic**: 1 token ≈ 4 characters

Example:
- Memory 1: "The user prefers dark mode" (150 chars ≈ 38 tokens)
- Memory 2: "The user prefers dark mode" (150 chars ≈ 38 tokens)
- Merged: "User prefers dark mode" (40 chars ≈ 10 tokens)
- **Saved**: 38 + 38 - 10 = **66 tokens per merge**

With 100 similar memories consolidated, saves ~6,600 tokens (typical recall context ~2% reduction).

## Reversibility

All merges are completely reversible:

1. **Full snapshots stored**: Original memories backed up in merge history
2. **Soft archive**: Merged memories marked inactive but never deleted
3. **Single command reversal**: `reverse_merge` restores original state
4. **Atomic operations**: All changes within single transaction
5. **Audit trail**: Complete history of all reversals

## Examples

### Example 1: Find and Approve a Merge

```javascript
// 1. Detect duplicates
const detection = await mcp.call('detect_duplicate_memories', {
  projectId: myProject.id,
  threshold: 0.85
});

// 2. List proposals
const proposals = await mcp.call('list_merge_proposals', {
  projectId: myProject.id,
  status: 'pending'
});

// 3. Preview first proposal
const preview = await mcp.call('preview_merge', {
  proposalId: proposals.data.proposals[0].id
});

console.log(`Merging these ${preview.data.sourceMemories.length} memories`);
console.log(`Will save: ${preview.data.analysis.savedTokens} tokens`);

// 4. Approve if looks good
const result = await mcp.call('approve_merge', {
  proposalId: proposals.data.proposals[0].id,
  reviewNotes: 'Verified context match'
});

console.log(`Created canonical memory: ${result.data.canonicalMemoryId}`);
```

### Example 2: Bulk Review and Approve

```javascript
const proposals = await mcp.call('list_merge_proposals', {
  projectId: myProject.id,
  limit: 100
});

for (const proposal of proposals.data.proposals) {
  const preview = await mcp.call('preview_merge', {
    proposalId: proposal.id
  });

  if (preview.data.analysis.savedPercentage > 20) {
    // Only approve high-impact merges
    await mcp.call('approve_merge', {
      proposalId: proposal.id,
      reviewNotes: `High token savings: ${preview.data.analysis.savedTokens}`
    });
  } else {
    await mcp.call('reject_merge', {
      proposalId: proposal.id,
      reviewNotes: 'Low impact'
    });
  }
}
```

### Example 3: Undo a Merge

```javascript
// Get merge history
const stats = await mcp.call('get_merge_stats', {
  projectId: myProject.id
});

console.log(`${stats.data.approvedMerges} merges completed`);

// Undo the last merge (if needed)
if (stats.data.approvedMerges > 0) {
  const result = await mcp.call('reverse_merge', {
    mergeHistoryId: 'merge-history-id-to-reverse',
    reason: 'Realized these were different contexts'
  });

  console.log(`Restored ${result.data.restoredMemoryIds.length} memories`);
}
```

## Performance

### Speed

- **Detection**: ~250-400ms per 100 memories (Stage 1)
- **Ranking**: ~1-2s per 500 candidates (Stage 2)
- **Merge execution**: ~200ms per merge
- **Reversibility**: ~100ms per reversal

### Token Savings Typical

- **High overlap** (3+ memories merged): 50-100+ tokens saved per merge
- **Medium overlap** (2 memories): 20-50 tokens saved
- **Project-wide**: 10-20% context window reduction typical

## Best Practices

1. **Start conservative**: Use threshold 0.90 initially, lower over time
2. **Review high-impact first**: Approve high-confidence, high-savings merges first
3. **Check context**: Preview before approving to ensure semantic correctness
4. **Keep reversals handy**: Know how to undo if merges were too aggressive
5. **Periodic cleanup**: Run detection weekly to maintain token efficiency
6. **Monitor quality**: Review rejected proposals to tune thresholds

## Troubleshooting

### Low Detection Rate

- Increase `minhashThreshold` (currently 0.7, try 0.6-0.65)
- Increase `semanticThreshold` (currently 0.85, try 0.80-0.82)
- Check embeddings quality (test with `get_embeddings`)

### False Positives (Bad Merges)

- Decrease thresholds (too many false matches)
- Review and reject aggressive proposals
- Check safety check warnings carefully
- Consider `isMergeable=false` on sensitive memories

### Performance Issues

- Use `stage1Only: true` flag for just hash-based results
- Process projects incrementally
- Monitor hash cache staleness
- Consider SQLite→PostgreSQL migration for large datasets

## Architecture

```
features/merge/
├── detection/
│   ├── hash-filters.ts          # SimHash + MinHash
│   ├── semantic-ranker.ts       # Embedding cosine similarity
│   └── two-stage-detector.ts    # Detection orchestrator
├── strategies/
│   └── merge-strategies.ts      # Type-specific merge logic
├── safety/
│   └── safety-checks.ts         # 8 safety rules
├── analytics/
│   └── token-estimator.ts       # Token math
├── handlers/
│   ├── detect-duplicates.ts
│   ├── list-proposals.ts
│   ├── preview-merge.ts
│   ├── approve-merge.ts         # CRITICAL: atomic merge execution
│   ├── reject-merge.ts
│   ├── reverse-merge.ts         # CRITICAL: reversibility
│   └── get-stats.ts
├── operations/
│   └── cache-maintenance.ts     # Hash cache management
├── types.ts                      # TypeScript interfaces
└── README.md                     # This file
```

## Future Enhancements

- [ ] LLM-based conflict resolution for decisions
- [ ] Background periodic scanning
- [ ] Batch approval workflow
- [ ] Web UI merge inbox dashboard
- [ ] Embedding model fine-tuning
- [ ] SQLite→PostgreSQL migration tool
- [ ] Merge analytics dashboard
