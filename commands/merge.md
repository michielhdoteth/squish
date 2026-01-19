---
description: Manage memory merges (detect, list, preview, stats, approve, reject, reverse)
---

# Memory Merge Management

Manage memory consolidation: detect duplicates, review proposals, preview merges, view statistics, and make decisions on merge proposals.

## Actions

### detect
Scan for similar or duplicate memories and create merge proposals.
- Uses advanced similarity detection (simhash, minhash, semantic embedding)
- Filters by optional similarity threshold and memory type
- Automatically creates proposals for similar memories
- Returns list of detected duplicates with similarity scores

### list
View pending merge proposals for review.
- Lists all proposals in specified status (pending, approved, rejected, expired)
- Shows similarity scores and token savings estimates
- Displays memory pairs and consolidation recommendations

### preview
See exactly what a merged memory will look like before executing.
- Shows the result of merging two memories
- Displays token savings
- Shows similarity analysis and consolidation reasoning
- Does not modify any memories

### stats
Get merge statistics and analytics.
- Total tokens saved from merges
- Number of merges completed
- Most commonly merged memory types
- Merge trends over time

### approve
Execute a merge proposal and consolidate similar memories.
- Combines two memories into one
- Records token savings
- Creates audit trail for reversibility
- Updates memory relationships

### reject
Decline a merge proposal and keep memories separate.
- Marks proposal as rejected
- Prevents future suggestions for same memory pair
- No changes to original memories
- Useful when memories should remain distinct

### reverse
Undo a previously completed merge and restore original memories.
- Restores all original memories from before merge
- Removes the merged memory
- Preserves complete audit history
- Can be called multiple times on different merged memories

## Usage Examples

Detect duplicate memories:
```
/merge action=detect projectId=my-project
```

Detect with filters:
```
/merge action=detect projectId=my-project threshold=0.8 memoryType=fact
```

List pending proposals:
```
/merge action=list projectId=my-project status=pending
```

Preview a merge:
```
/merge action=preview projectId=my-project proposalId=proposal-123
```

View merge statistics:
```
/merge action=stats projectId=my-project
```

Approve a merge:
```
/merge action=approve projectId=my-project proposalId=proposal-123 reviewNotes="Both are about API design patterns"
```

Reject a proposal:
```
/merge action=reject projectId=my-project proposalId=proposal-456 reviewNotes="These are separate concerns"
```

Reverse a completed merge:
```
/merge action=reverse projectId=my-project mergeHistoryId=merge-789
```

## Similarity Thresholds

- **0.5-0.6**: Very similar (recommended for detection)
- **0.7-0.8**: Highly similar (conservative threshold)
- **0.9+**: Nearly identical (very safe threshold)

## Memory Type Filters

- fact
- preference
- decision
- observation
- context
