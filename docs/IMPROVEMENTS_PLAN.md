# Squish Improvement Plan - Next Version

This document outlines architectural improvements and feature enhancements for the next major version of Squish, based on recent research in AI agent memory systems and benchmarking studies.

## Executive Summary

Recent research into AI agent memory systems has revealed key insights:
- Simple, explicit memory management tools outperform complex automatic retrieval systems
- Agents perform better when they have direct control over their context window
- Two-tier memory architectures (in-context vs out-of-context) provide better performance
- Always-visible core memory significantly improves agent task completion
- Filesystem-like interfaces are more intuitive for agents than specialized retrieval tools

## Core Architectural Changes

### 1. Two-Tier Memory Architecture

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

### 2. Core Memory System (Always-In-Context)

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

### 3. Explicit Memory Paging

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

### 4. Separation of Archival vs Recall Memory

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

### 5. Tool Simplification

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

### 6. Memory Status Visibility

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

### 7. Iterative Search Patterns

**Current State**: Single-shot search with one query.

**Enhanced Tools**:
- `search_refine(previousResultIds, newQuery)` - Refine based on previous results
- `search_similar(memoryId, limit)` - Find similar memories
- `search_related(memoryId, traversalDepth)` - Traverse association graph
- Search results include "related terms" suggestions
- Show total result count even when limiting returns

**Benefits**:
- Agents can explore memory space iteratively
- Better handling of ambiguous queries
- Natural discovery of related information

### 8. Filesystem-Like Memory Browsing

**New Feature**: Simple browsing interface for memory exploration.

**New Tools**:
- `list_memories(type, limit, offset)` - Paginated memory listing
- `grep_memories(pattern, filters)` - Text pattern matching
- `memory_tree(projectId)` - Hierarchical view of memory organization

**Benefits**:
- More intuitive for agents (trained on filesystem operations)
- Enables exploratory workflows
- Simpler than complex query construction

### 9. Memory Editing and Versioning

**Enhanced Feature**: Make memory updates first-class operations.

**New Tool**: `memory_update(memoryId, newContent, reason)`

**Enhanced Features**:
- `memory_history(memoryId)` - View all versions of a memory
- `memory_diff(memoryId, versionA, versionB)` - Compare versions
- Auto-create superseded relationships
- Track update reasons/provenance

**Benefits**:
- Agents can correct outdated information
- Maintain edit history for debugging
- Understand how information evolved

### 10. Memory Provenance and Trust Signals

**New Feature**: Quality indicators for memories.

**New Metadata Fields**:
```typescript
{
  verified: boolean;              // Confirmed by multiple sessions
  source: 'user' | 'auto' | 'inferred';
  confidenceScore: 0-1;          // For auto-generated observations
  confirmationCount: number;      // How many times confirmed
  lastAccessedAt: timestamp;
  accessCount: number;
}
```

**New Filters**:
- `archival_memory_search(query, minConfidence: 0.8)`
- `archival_memory_search(query, verifiedOnly: true)`

**Benefits**:
- Agents can prioritize high-quality information
- Identify potentially outdated or incorrect data
- Build trust through verification

## Privacy and Security Enhancements

### 11. Enhanced Privacy Filtering

**Current State**: Basic secret detection and private tags.

**Enhancements**:
- Expand secret pattern detection (more credential types)
- Add redaction rather than filtering (replace secrets with `[REDACTED]`)
- Per-project privacy rules configuration
- User-definable sensitive patterns
- Privacy audit logs

### 12. Memory Governance Improvements

**Enhancements**:
- Automatic protection of high-value memories (accessed > N times)
- User-reviewable auto-capture queue
- Batch approve/reject for auto-captured memories
- Memory retention policies (GDPR compliance)
- Export/import for data portability

## Performance Optimizations

### 13. Intelligent Caching

**Enhancements**:
- Cache frequently loaded memories in main context
- Predictive loading based on agent behavior patterns
- LRU eviction for rarely accessed memories
- Cache warming on session start

### 14. Query Optimization

**Enhancements**:
- Query result caching with intelligent invalidation
- Parallel search across full-text and semantic indexes
- Query rewriting for better recall
- Search analytics to improve indexes

### 15. Background Processing

**Enhancements**:
- Async embedding generation (don't block on storage)
- Incremental association graph updates
- Progressive summarization during idle time
- Smart batching of database operations

## Benchmarking and Quality

### 16. Built-in Benchmark Suite

**New Feature**: Self-testing framework for memory system quality.

**Benchmark Categories**:
1. **Multi-turn Retrieval**: Can agents find information across multiple searches?
2. **Fact Recall**: Accuracy of retrieving specific stored facts
3. **Temporal Reasoning**: Finding information by time relationships
4. **Memory Update**: Correctly updating outdated information
5. **Context Management**: Efficient use of context window

**Metrics**:
- Accuracy (% correct retrievals)
- Efficiency (tool calls per task)
- Token usage (total tokens consumed)
- Latency (time to complete tasks)

**Tool**: `run_benchmark(category, difficulty)`

### 17. Memory Quality Metrics

**New Monitoring**:
- Search success rate (queries that return useful results)
- Memory utilization (which memories are accessed)
- Duplicate detection rate
- Context window efficiency
- Auto-capture precision/recall

## Developer Experience

### 18. Memory Debugging Tools

**New Features**:
- `memory_explain(memoryId)` - Why was this stored? Why retrieved?
- `search_debug(query)` - Show search scoring and ranking
- `context_timeline()` - What was loaded/evicted and when?
- Memory access logs with reasoning

### 19. Configuration Improvements

**Enhancements**:
- Per-project memory settings
- User preference templates
- Environment-specific configs (dev/staging/prod)
- Feature flags for gradual rollout
- A/B testing support

### 20. Documentation and Examples

**New Documentation**:
- Memory tool usage cookbook
- Best practices for memory management
- Common patterns and anti-patterns
- Migration guide from v0.4.0
- Architecture deep-dive
- Performance tuning guide

## Migration Path

### From v0.4.0 to v0.5.0

**Breaking Changes**:
- Tool consolidation (14 → 8-10 tools)
- Renamed tools for clarity
- New required core memory initialization

**Migration Steps**:
1. Update tool names in existing integrations
2. Initialize core memory structure
3. Configure core memory size limits
4. Update auto-capture settings (now silent by default)
5. Migrate protected memories to core memory
6. Test with compatibility mode enabled

**Compatibility Mode**:
- Keep old tool names as aliases (deprecated)
- Auto-migrate pinned memories to core memory
- Gradual deprecation warnings
- Full removal in v0.6.0

## Implementation Phases

### Phase 1: Core Architecture (Version 0.5.0)
**Timeline**: 2-3 weeks
- Implement two-tier memory system
- Add core memory functionality
- Add explicit paging tools
- Separate archival/recall memory
- Update storage schema

### Phase 2: Tool Simplification (Version 0.5.0)
**Timeline**: 1-2 weeks
- Consolidate to 8-10 core tools
- Make auto-capture silent
- Automate lifecycle management
- Update tool documentation

### Phase 3: Enhanced Features (Version 0.6.0)
**Timeline**: 2-3 weeks
- Add memory status visibility
- Implement iterative search
- Add filesystem-like browsing
- Enhanced memory editing
- Provenance tracking

### Phase 4: Quality & Performance (Version 0.6.0)
**Timeline**: 2-3 weeks
- Implement benchmark suite
- Performance optimizations
- Enhanced caching
- Query optimization

### Phase 5: Polish & Launch (Version 0.6.0)
**Timeline**: 1-2 weeks
- Documentation updates
- Migration guides
- Example implementations
- Performance testing
- Beta testing with users

## Success Metrics

### Performance Targets
- 95%+ accuracy on benchmark tasks
- < 5 tool calls for typical memory operations
- 30%+ reduction in token usage vs v0.4.0
- < 100ms latency for memory operations
- 10K+ ops/sec search performance maintained

### User Experience Targets
- Clearer mental model (measured by user surveys)
- Reduced support questions about tool usage
- Higher feature adoption rates
- Positive feedback on agent autonomy

## Risks and Mitigations

### Risk: Breaking Changes
**Mitigation**: Comprehensive compatibility mode, gradual deprecation, clear migration docs

### Risk: Performance Regression
**Mitigation**: Extensive benchmarking, performance budgets, load testing

### Risk: Complexity for New Users
**Mitigation**: Smart defaults, progressive disclosure, excellent documentation

### Risk: Migration Difficulty
**Mitigation**: Automated migration tools, compatibility mode, professional support

## Conclusion

This improvement plan transforms Squish from a smart retrieval system into an agent-controlled memory manager. By implementing two-tier architecture, core memory, and explicit paging, we align with proven patterns from recent research while maintaining Squish's strengths in privacy, governance, and scalability.

The changes prioritize agent autonomy, clarity, and performance while reducing complexity through tool consolidation and automation of non-essential features.

**Key Differentiators After Implementation**:
1. Agent-controlled context management (not automatic)
2. Always-visible core memory for critical information
3. Operating system-inspired memory architecture
4. Simple, filesystem-like tool interface
5. Built-in benchmarking and quality metrics
6. Privacy-first with enterprise governance

These improvements position Squish as the leading memory system for production AI agents requiring autonomy, reliability, and scale.
