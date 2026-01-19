---
description: Remove a memory from working set
---

# Evict Memory from Context

Remove a memory from your current working set (paging out).

Note: Claude manages its own context and tokens. This tool tracks your working set for reference.

## Usage

```
/evict-from-context sessionId=<session-id> memoryId=<memory-id>
```

## Parameters
- sessionId: Current session ID
- memoryId: UUID of memory to evict from working set
