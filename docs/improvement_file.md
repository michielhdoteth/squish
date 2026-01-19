# Squish Improvement Plan - Next Version

This document outlines architectural improvements and feature enhancements for the next major version of Squish, based on recent research in AI agent memory systems and benchmarking studies.

## Executive Summary

Recent research into AI agent memory systems has revealed key insights:
- Simple, explicit memory management tools outperform complex automatic retrieval systems
- Agents perform better when they have direct control over their context window
- Two-tier memory architectures (in-context vs out-of-context) provide better performance
- Always-visible core memory significantly improves agent task completion
- Filesystem-like interfaces are more intuitive for agents than specialized retrieval tools

## Implementation Status

### ✅ Completed
1. **Core Memory System** - Implemented always-in-context memory (Tier 1)
   - Database schema for both SQLite and PostgreSQL
   - Core memory service with CRUD operations
   - Tools: core_memory_view, core_memory_edit, core_memory_append
   - 2KB size limit with 1KB per section
   - Four sections: persona, user_info, project_context, working_notes

2. **Context Paging System** - Implemented agent-controlled memory loading (Tier 2)
   - Database schema for context sessions
   - Paging service with load/evict/view operations
   - Tools: load_to_context, evict_from_context, view_loaded_memories, context_status
   - Token tracking and budget management
   - Session-based memory management

3. **Tool Integration** - Added 7 new MCP tools
   - Integrated into main index.ts
   - Proper error handling and validation
   - Full TypeScript compilation success

### 🚧 In Progress
_None currently_

### 📋 Pending
- Separation of archival vs recall memory tools
- Complete testing of new features
- Documentation updates
- Migration guides

---

## Core Architectural Changes

### 1. Two-Tier Memory Architecture ✅ COMPLETED

**Current State**: All memories are treated equally and require retrieval.

**Proposed Change**: Implement a two-tier system inspired by operating system virtual memory:

**Tier 1: Main Context (In-Context Memory)**
- Always visible to the agent in every interaction
- Small, highly relevant memories (< 2KB total)
- Editable by the agent through tools
- Persists across sessions
- No retrieval required

**Tier 2: External Context (Out-of-Context Memory)**
- Large-scale storage for all historical data
- Requires explicit loading/paging by the agent
- Semantic and full-text search capabilities
- Can be loaded into main context on demand

**Benefits**:
- Reduces unnecessary retrieval operations
- Gives agents persistent working memory
- Improves task continuity across sessions
- Reduces token usage for frequently needed information

### 2. Core Memory System (Always-In-Context) ✅ COMPLETED

**New Feature**: Implement a small, persistent, always-visible memory block.

**Structure**:
```typescript
CoreMemory {
  persona: string;           // Agent's role and capabilities
  user_info: string;         // User preferences and context
  project_context: string;   // Current project state
  working_notes: string;     // Temporary session notes
}
```

**Size Limit**: 1-2KB total (approximately 300-600 tokens)

**New Tools**:
- `core_memory_view()` - Display all core memory sections
- `core_memory_edit(section, content)` - Replace a section entirely
- `core_memory_append(section, text)` - Add to existing section
- `core_memory_replace(section, old, new)` - Update specific text

**Auto-Injection**: Core memory is automatically injected into every agent interaction without requiring retrieval.

### 3. Explicit Memory Paging ✅ COMPLETED

**Current State**: Auto-capture and auto-injection of memories.

**Proposed Change**: Agent-controlled memory loading and eviction.

**New Tools**:
- `load_to_context(memoryId)` - Explicitly page memory into main context
- `evict_from_context(memoryId)` - Remove memory from main context
- `view_loaded_memories()` - See what's currently in main context
- `context_status()` - View token usage and capacity

**Philosophy Shift**: From "smart automatic retrieval" to "agent-controlled memory manager"

**Benefits**:
- Agents decide what they need
- Reduces irrelevant context injection
- Gives agents visibility into their context window
- Enables iterative memory exploration

### 4. Separation of Archival vs Recall Memory ❌ NOT STARTED

**Current State**: Single unified memory search across all types.

**Proposed Change**: Split into two distinct memory systems with purpose-specific tools.

**Archival Memory** (for facts, observations, documents):
- `archival_memory_insert(content, tags, metadata)`
- `archival_memory_search(query, limit)`
- Optimized for semantic search over embeddings
- Long-term fact storage

**Recall Memory** (for conversation history):
- `recall_memory_search(query, limit)`
- `recall_memory_date_range(startDate, endDate)`
- `conversation_search(keywords)`
- Optimized for temporal and text search
- Full conversation log storage

**Benefits**:
- Clearer mental model for agents
- Optimized search strategies per type
- Faster retrieval with purpose-built indexes

### 5. Tool Simplification ❌ NOT STARTED

**Current State**: 14 tools with overlapping functionality.

**Proposed State**: 8 focused tools with clear purposes.

**Proposed Tool Set**:
```
Core Memory (New):
✅ core_memory_view()
✅ core_memory_edit(section, content)
✅ core_memory_append(section, text)

Memory Management (New):
✅ load_to_context(memoryId)
✅ evict_from_context(memoryId)
✅ context_status()

Archival Memory (Refactored):
✅ archival_memory_insert(content, tags)
✅ archival_memory_search(query, limit)

Recall Memory (New):
✅ recall_memory_search(query, limit)
✅ recall_memory_date_range(start, end)
```

**Tools to Remove/Automate**:
- `observe` → Make automatic, not a tool
- `recall` (by ID) → Merge into search
- `context` → Replace with context_status
- `health` → Not memory-related, move to admin
- `merge_decide` → Make fully automatic
- `lifecycle` → Make automatic (background worker)
- `summarize_session` → Make automatic
- `protect_memory` → Add as flag to archival_memory_insert
- `pin_memory` → Move functionality to core_memory_edit

**Result**: Cleaner API surface with clearer tool purposes.

## Feature Enhancements

### 6. Memory Status Visibility ✅ COMPLETED

**New Feature**: Comprehensive context window visibility for agents.

**Tool**: `context_status()`

**Returns**:
```json
{
  "mainContext": {
    "coreMemory": {
      "used": 1200,
      "limit": 2000,
      "tokens": 400
    },
    "loadedMemories": [
      {
        "id": "mem_123",
        "type": "observation",
        "tokens": 150,
        "loadedAt": "2026-01-19T10:30:00Z"
      }
    ],
    "totalTokens": 3500,
    "availableTokens": 4500
  },
  "externalContext": {
    "archivalCount": 1247,
    "recallCount": 89,
    "lastUpdate": "2026-01-19T10:30:00Z"
  },
  "recommendations": [
    {
      "memoryId": "mem_456",
      "reason": "Related to current task",
      "relevance": 0.92,
      "estimatedTokens": 200
    }
  ]
}
```

**Benefits**:
- Agents understand their context budget
- Can make informed loading decisions
- See token costs before loading
- Get AI-powered recommendations

### 7. Iterative Search Patterns ❌ NOT STARTED
### 8. Filesystem-Like Memory Browsing ❌ NOT STARTED
### 9. Memory Editing and Versioning ❌ NOT STARTED
### 10. Memory Provenance and Trust Signals ❌ NOT STARTED

## Privacy and Security Enhancements

### 11. Enhanced Privacy Filtering ❌ NOT STARTED
### 12. Memory Governance Improvements ❌ NOT STARTED

## Performance Optimizations

### 13. Intelligent Caching ❌ NOT STARTED
### 14. Query Optimization ❌ NOT STARTED
### 15. Background Processing ❌ NOT STARTED

## Benchmarking and Quality

### 16. Built-in Benchmark Suite ❌ NOT STARTED
### 17. Memory Quality Metrics ❌ NOT STARTED

## Developer Experience

### 18. Memory Debugging Tools ❌ NOT STARTED
### 19. Configuration Improvements ❌ NOT STARTED
### 20. Documentation and Examples ❌ NOT STARTED

## Next Steps

The implementation will proceed in phases as outlined in the detailed sections above. Each section will be updated with ✅ COMPLETED status as work is finished and tested.
