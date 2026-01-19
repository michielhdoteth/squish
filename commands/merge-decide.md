---
description: Approve, reject, or reverse memory merge proposals
---

# Merge Proposal Decisions

Make decisions on memory merge proposals to consolidate or keep memories separate.

## Actions

### approve
Execute a merge proposal to consolidate similar memories.
- Records token savings
- Creates audit trail for reversibility
- Updates memory relationships

### reject
Decline a merge proposal and keep memories separate.
- Marks proposal as rejected
- Prevents future suggestions for same pair
- No changes to original memories

### reverse
Undo a previously completed merge and restore original memories.
- Restores all original memories
- Removes merged memory
- Preserves audit history

## Usage Examples

Approve merge:
```
/merge-decide action=approve proposalId=<proposal-id>
```

Reject merge:
```
/merge-decide action=reject proposalId=<proposal-id>
```

Reverse merge:
```
/merge-decide action=reverse mergeId=<merge-id>
```
