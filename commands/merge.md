---
description: Manage memory merge proposals (detect, list, preview, statistics)
---

# Memory Merge Management

Detect duplicate memories, list merge proposals, preview merge results, and view merge statistics.

## Modes

### detect
Scan for similar memories and create merge proposals.
- Uses advanced similarity detection (simhash, minhash, semantic embedding)
- Automatically identifies consolidation opportunities

### list
View pending merge proposals for review.
- Filter by status: pending, approved, rejected, expired
- Shows similarity scores and token savings

### preview
See the result of a merge proposal without applying it.
- Shows exactly what the merged memory will look like
- Displays token savings and similarity analysis

### stats
Get merge statistics and analytics.
- Total tokens saved
- Merge count and trends
- Most merged memory types

## Usage Examples

Detect duplicates:
```
/merge mode=detect projectId=<project-id>
```

List proposals:
```
/merge mode=list projectId=<project-id> status=pending
```

Preview merge:
```
/merge mode=preview proposalId=<proposal-id>
```

View statistics:
```
/merge mode=stats projectId=<project-id>
```
