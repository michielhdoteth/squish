# Migration Guide: Squish v0.3 → v0.4

## Summary

Squish v0.4.0 consolidates 23 tools down to 14 tools (39% reduction) while preserving all functionality. This makes the plugin easier to use and discover.

## Tool Consolidations

### 1. Merge System: 7 → 2 Tools

The merge workflow is now consolidated into two focused tools:

**Old approach (7 separate tools):**
```json
{"tool": "detect_duplicate_memories", "projectId": "..."}
{"tool": "list_merge_proposals", "projectId": "..."}
{"tool": "preview_merge", "proposalId": "..."}
{"tool": "approve_merge", "proposalId": "..."}
{"tool": "reject_merge", "proposalId": "..."}
{"tool": "reverse_merge", "mergeHistoryId": "..."}
{"tool": "get_merge_stats", "projectId": "..."}
```

**New approach:**
```json
// Read-only operations (inspect workflow)
{"tool": "merge", "mode": "detect", "projectId": "..."}
{"tool": "merge", "mode": "list", "projectId": "..."}
{"tool": "merge", "mode": "preview", "proposalId": "..."}
{"tool": "merge", "mode": "stats", "projectId": "..."}

// Write operations (decision workflow)
{"tool": "merge_decide", "action": "approve", "proposalId": "..."}
{"tool": "merge_decide", "action": "reject", "proposalId": "..."}
{"tool": "merge_decide", "action": "reverse", "mergeHistoryId": "..."}
```

**Rationale:** Clear separation between inspection (read-only) and decision-making (write operations).

---

### 2. Remember Tools: 2 → 1 Tool

Agent context is now an optional feature of the main `remember` tool:

**Old approach (agent-specific tool):**
```json
{"tool": "agent_remember", "content": "...", "agentId": "ci-bot", "visibilityScope": "team"}
```

**New approach (optional parameters):**
```json
{"tool": "remember", "content": "...", "agentId": "ci-bot", "visibilityScope": "team"}
```

**Backward compatible:** Call without agent params works exactly as before
```json
{"tool": "remember", "content": "..."}
```

---

### 3. Search Tools: 3 → 1 Tool

All search operations now use a single tool with a `scope` parameter:

**Old approach (3 separate tools):**
```json
{"tool": "search", "query": "authentication"}
{"tool": "conversations", "query": "bug report"}
{"tool": "recent", "n": 5}
```

**New approach:**
```json
// Memory search (default scope)
{"tool": "search", "query": "authentication", "scope": "memories"}
{"tool": "search", "query": "authentication"}  // scope defaults to "memories"

// Conversation search
{"tool": "search", "query": "bug report", "scope": "conversations"}

// Recent items (query optional)
{"tool": "search", "scope": "recent", "n": 5}
{"tool": "search", "scope": "recent"}  // gets 3 recent items by default
```

---

## Final Tool List (14 Tools)

### Core Memory (3)
- `remember` - Store memory (with optional agent context)
- `recall` - Get memory by ID
- `search` - Search memories/conversations/recent (with scope)

### Context & Observations (3)
- `observe` - Store observations
- `context` - Get project context
- `health` - Check service status

### Memory Merge System (2)
- `merge` - Detect, list, preview, stats (mode parameter)
- `merge_decide` - Approve, reject, reverse (action parameter)

### Lifecycle (2)
- `lifecycle` - Memory maintenance
- `summarize_session` - Session summarization

### Advanced Memory (4)
- `get_related` - Association graph
- `protect_memory` - Prevent eviction
- `pin_memory` - Auto-inject to context
- (1 reserved slot for future tools)

---

## Breaking Changes

| Old Tool | New Tool | Migration |
|----------|----------|-----------|
| `agent_remember` | `remember` (with `agentId`) | Add `agentId` parameter |
| `conversations` | `search` (with `scope: 'conversations'`) | Add `scope: 'conversations'` |
| `recent` | `search` (with `scope: 'recent'`) | Add `scope: 'recent'` |
| `detect_duplicate_memories` | `merge` (with `mode: 'detect'`) | Add `mode: 'detect'` |
| `list_merge_proposals` | `merge` (with `mode: 'list'`) | Add `mode: 'list'` |
| `preview_merge` | `merge` (with `mode: 'preview'`) | Add `mode: 'preview'` |
| `approve_merge` | `merge_decide` (with `action: 'approve'`) | Add `action: 'approve'` |
| `reject_merge` | `merge_decide` (with `action: 'reject'`) | Add `action: 'reject'` |
| `reverse_merge` | `merge_decide` (with `action: 'reverse'`) | Add `action: 'reverse'` |
| `get_merge_stats` | `merge` (with `mode: 'stats'`) | Add `mode: 'stats'` |

---

## Implementation Notes

### All Handlers Unchanged
All 7 merge handlers remain unchanged internally. The new `merge` and `merge_decide` tools simply dispatch to them based on mode/action parameters:

- `handleDetectDuplicates` - called by `merge` with `mode: 'detect'`
- `handleListProposals` - called by `merge` with `mode: 'list'`
- `handlePreviewMerge` - called by `merge` with `mode: 'preview'`
- `handleApproveMerge` - called by `merge_decide` with `action: 'approve'`
- `handleRejectMerge` - called by `merge_decide` with `action: 'reject'`
- `handleReverseMerge` - called by `merge_decide` with `action: 'reverse'`
- `handleGetMergeStats` - called by `merge` with `mode: 'stats'`

---

## Testing

### Verify Tool Consolidation
```bash
npm run build          # TypeScript should compile
npm test              # All tests should pass
```

### Test Merge Workflow
```json
// 1. Detect duplicates
{"tool": "merge", "mode": "detect", "projectId": "uuid", "threshold": 0.85}

// 2. List proposals
{"tool": "merge", "mode": "list", "projectId": "uuid", "status": "pending"}

// 3. Preview merge
{"tool": "merge", "mode": "preview", "proposalId": "uuid"}

// 4. Approve
{"tool": "merge_decide", "action": "approve", "proposalId": "uuid"}

// 5. Get stats
{"tool": "merge", "mode": "stats", "projectId": "uuid"}

// 6. Reverse (if needed)
{"tool": "merge_decide", "action": "reverse", "mergeHistoryId": "uuid"}
```

### Test Search Consolidation
```json
// Search memories
{"tool": "search", "query": "authentication bug"}
{"tool": "search", "query": "authentication", "scope": "memories"}

// Search conversations
{"tool": "search", "query": "deployment", "scope": "conversations"}

// Get recent
{"tool": "search", "scope": "recent", "n": 10}
```

### Test Agent Memory
```json
// Without agent context
{"tool": "remember", "content": "Important fact"}

// With agent context
{"tool": "remember", "content": "CI-bot fact", "agentId": "ci-bot", "agentRole": "automation", "visibilityScope": "team"}
```

---

## Rollback

If you need to rollback to v0.3.0:

```bash
git checkout v0.3.0
npm install
npm run build
```

---

## Questions?

Refer to the updated command files:
- `commands/merge.md` - Mode-based merge operations
- `commands/merge-decide.md` - Merge decision actions
- `commands/remember.md` - Agent context parameters
- `commands/search.md` - Search scope options
