---
description: Manage working set (load, evict, or view loaded memories)
---

# Context Paging Management

Manage your working set of memories for context tracking. Note: Claude manages its own context and token usage. These tools track which memories you're actively working with.

## Actions

### load
Add a memory to your working set for active tracking.
- Marks memory as currently relevant
- Helps organize which memories are in your active consideration set
- Does not affect Claude's actual context usage

### evict
Remove a memory from your working set.
- Removes from your active tracking set
- Memory is still stored and searchable
- Useful when memory is no longer actively relevant

### view
View all memories currently in your working set.
- Shows all memories you're actively tracking
- Displays session ID and timestamp loaded
- Lists memory content and metadata

## Usage Examples

Load a memory to working set:
```
/context-paging action=load sessionId=sess-123 memoryId=mem-uuid-456
```

Evict memory from working set:
```
/context-paging action=evict sessionId=sess-123 memoryId=mem-uuid-456
```

View all loaded memories in session:
```
/context-paging action=view sessionId=sess-123
```

## Important Notes

- Working set is per-session - each Claude Code session has its own working set
- Claude Code manages its own context window automatically
- These tools are for your own organizational purposes
- Memory removal from working set does not delete the memory permanently
