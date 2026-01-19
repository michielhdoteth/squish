# Migration Guide: Squish v0.5.0

## Overview

Squish v0.5.0 is a major consolidation release that reduces MCP tools from 18 to 11 (39% reduction) while maintaining all functionality. This is a **breaking change** in the MCP tool API.

## What Changed

### Tool Consolidations

#### 1. Core Memory: 3 tools → 1 tool

**Old API**:
```
/core_memory_view projectId=my-project
/core_memory_edit projectId=my-project section=persona content="..."
/core_memory_append projectId=my-project section=persona text="..."
```

**New API** (v0.5.0):
```
/core_memory action=view projectId=my-project
/core_memory action=edit projectId=my-project section=persona content="..."
/core_memory action=append projectId=my-project section=persona text="..."
```

**Migration Steps**:
1. Replace tool name: `core_memory_view` → `core_memory` with `action=view`
2. Replace tool name: `core_memory_edit` → `core_memory` with `action=edit`
3. Replace tool name: `core_memory_append` → `core_memory` with `action=append`

---

#### 2. Context Paging: 3 tools → 1 tool

**Old API**:
```
/load_to_context sessionId=sess-123 memoryId=mem-456
/evict_from_context sessionId=sess-123 memoryId=mem-456
/view_loaded_memories sessionId=sess-123
```

**New API** (v0.5.0):
```
/context_paging action=load sessionId=sess-123 memoryId=mem-456
/context_paging action=evict sessionId=sess-123 memoryId=mem-456
/context_paging action=view sessionId=sess-123
```

**Migration Steps**:
1. Replace: `load_to_context` → `context_paging action=load`
2. Replace: `evict_from_context` → `context_paging action=evict`
3. Replace: `view_loaded_memories` → `context_paging action=view`

---

#### 3. Merge: 2 tools → 1 tool

**Old API**:
```
/merge mode=detect projectId=my-project
/merge mode=list projectId=my-project
/merge mode=preview proposalId=prop-123
/merge mode=stats projectId=my-project
/merge_decide action=approve proposalId=prop-123
/merge_decide action=reject proposalId=prop-123
/merge_decide action=reverse mergeHistoryId=merge-789
```

**New API** (v0.5.0):
```
/merge action=detect projectId=my-project
/merge action=list projectId=my-project
/merge action=preview proposalId=prop-123
/merge action=stats projectId=my-project
/merge action=approve proposalId=prop-123
/merge action=reject proposalId=prop-123
/merge action=reverse mergeHistoryId=merge-789
```

**Migration Steps**:
1. Replace `merge` tool's `mode` parameter with `action`
2. Delete `merge_decide` tool completely
3. Replace all `merge_decide action=` calls with `merge action=` calls

---

## Tool Summary: v0.4.1 → v0.5.0

### Consolidated Tools (Removed from MCP list)

| Old Tools | New Tool | Status |
|-----------|----------|--------|
| core_memory_view | core_memory | Consolidated |
| core_memory_edit | core_memory | Consolidated |
| core_memory_append | core_memory | Consolidated |
| load_to_context | context_paging | Consolidated |
| evict_from_context | context_paging | Consolidated |
| view_loaded_memories | context_paging | Consolidated |
| merge (with modes) | merge (with actions) | Updated |
| merge_decide | merge (merged into single tool) | Consolidated |

### Unchanged Tools

| Tool | Status |
|------|--------|
| context_status | No change |
| remember | No change |
| recall | No change |
| search | No change |
| observe | No change |
| context | No change |
| health | No change |
| lifecycle | No change |
| summarize_session | No change |
| protect_memory | No change |
| pin_memory | No change |
| get_related | No change |

## Tool Count

- **v0.4.1**: 18 MCP tools + 25 command files
- **v0.5.0**: 11 MCP tools + 10 command files

**Reduction**:
- Tools: 39% reduction (18 → 11)
- Commands: 60% reduction (25 → 10)

## Migration Checklist

- [ ] Update all tool calls to use new action-based API
- [ ] Replace 3 core_memory_* tools with single core_memory tool
- [ ] Replace 3 context paging tools with context_paging tool
- [ ] Update merge tool: mode → action, delete merge_decide
- [ ] Test all memory operations still work
- [ ] Test context paging operations
- [ ] Test merge detection and approval flow
- [ ] Verify CLI slash commands match new tool names

## Backward Compatibility

**None.** This is a breaking change. The old tool names are completely removed. You must update all code that uses these tools before upgrading to v0.5.0.

## Command Documentation

All command documentation has been updated to reflect the new API:

- `commands/core-memory.md` - Consolidated core memory management
- `commands/context-paging.md` - Consolidated context paging
- `commands/merge.md` - Consolidated merge management (all 7 actions)

## Benefits

1. **Simpler API**: Fewer tools to remember and navigate
2. **Consistent Pattern**: Action-based API across consolidated tools
3. **Better Organization**: Related operations grouped together
4. **Easier Discovery**: Fewer tools to list and understand
5. **Maintained Functionality**: All features preserved, just better organized

## Support

For questions or issues with migration, see:
- `docs/map.md` - Codebase structure and architecture
- `README.md` - Feature overview
- Command documentation in `commands/` directory
