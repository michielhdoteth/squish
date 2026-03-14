---
name: memory-guide
description: Expert guide for using Squish memory system v0.9.0. Use when managing persistent memory, storing context, recalling information, or optimizing memory usage across MCP clients.
version: 0.9.0
author: michielhdoteth
tags: [memory, persistence, squish, guide, mcp, ai-assistant]
emoji: book
---

# Squish Memory System Guide v0.9.0

You are an expert at using the Squish persistent memory system for Claude Code.

## When to Use Squish Memory

Use Squish memory tools proactively for:

1. **Storing Important Information**
   - User preferences, project context, decisions made
   - Technical specifications, API patterns, architecture notes
   - Ongoing work, TODOs, blockers encountered

2. **Recalling Past Context**
   - Previous conversations and decisions
   - Code patterns used in this project
   - User's coding style preferences

3. **Managing Session Context**
   - Load relevant memories before starting complex tasks
   - Inject project-specific context
   - Maintain working memory across sessions

## Core Memory (Always In Context)

**Tool:** `core_memory` with `action` parameter

**Sections:**
- **persona**: Your identity, role, communication style
- **user_info**: User's name, preferences, coding style, expertise level
- **project_context**: Current project context, architecture, stack, patterns
- **working_notes**: Active TODOs, current focus, blockers, next steps

**Actions:**
- `view` - See all core memory sections
- `edit` - Replace content in a specific section
- `append` - Add to existing section content

**When to update:**
- Beginning of new projects (project_context section)
- When user shares preferences (user_info section)
- At end of sessions (working_notes section with TODOs)
- When identity/role changes (persona section)

**Example usage:**
```
/squish:core_memory action=append section=project_context text="Stack: TypeScript, React, PostgreSQL, Drizzle ORM"
/squish:core_memory action=edit section=working_notes content="Authentication complete. Next: implement API rate limiting"
/squish:core_memory action=view
```

## Context Paging (Working Set)

**Tool:** `context_paging` with `action` parameter

**Purpose:** Agent-controlled working memory for relevant information during tasks

**Actions:**
- `load` - Load memories into working context
- `evict` - Remove memories from working context
- `view` - See what's currently loaded

**When to load memories:**
- Before starting work: Load relevant past decisions, patterns
- During debugging: Load related error memories
- For refactoring: Load architectural notes

**When to evict:**
- Task completed
- Context getting full (check context_status)
- Information no longer relevant

**Example workflow:**
```
# Before starting authentication work
/squish:search query="authentication patterns we discussed"
/squish:context_paging action=load memoryIds=["id1","id2","id3"]

# Check what's loaded
/squish:context_paging action=view

# After completing task
/squish:context_paging action=evict memoryIds=["id1","id2"]
```

## Storing Memories

**Tool:** `remember`

**What to store:**
- Decisions made and rationale
- User preferences discovered
- Code patterns agreed upon
- Project-specific conventions
- Blockers encountered and solutions
- Technical specifications

**Memory types:**
- observation: Facts observed, patterns noticed
- fact: Technical facts, specifications
- decision: Decisions made with rationale
- context: Project/domain context
- preference: User preferences

**Example:**
```
/squish:remember content="User prefers functional components with hooks over class components" type=preference sector=autobiographical
/squish:remember content="API uses JWT tokens with 1-hour expiration, refresh tokens stored in httpOnly cookies" type=fact sector=semantic
```

## Search and Recall

**Tools:** `search`, `recall`

**Search strategies:**
- Semantic search: Natural language queries
- Full-text search: Specific keywords, file names
- Related memories: Find connected information via association graph

**Example:**
```
/squish:search query="database schema design decisions" limit=5
/squish:recall memoryId=abc123
```

## Best Practices

1. **Store proactively**: Don't wait until end of session
2. **Be specific**: Include context, timestamps, rationale
3. **Use appropriate types**: Choose correct memory type and sector
4. **Load selectively**: Don't load everything, focus on relevant memories
5. **Maintain core memory**: Keep project/working sections current
6. **Use associations**: Related memories are powerful for context

## Memory Lifecycle

- **Hot memories**: Recent, frequently accessed (auto-retained)
- **Warm memories**: Older but still relevant
- **Cold memories**: Old, rarely accessed (may be evicted)
- **Protected**: Marked important, won't be evicted
- **Pinned**: Auto-injected into context

**Governance:**
```
/squish:protect_memory memoryId=abc123
/squish:pin_memory memoryId=abc123
```

## Advanced Features

**Merge duplicates:**
```
/squish:merge action=detect
/squish:merge action=approve mergeId=xyz789
```

**Session summarization:**
```
/squish:summarize_session
```

**Health check:**
```
/squish:health
```

**Context status:**
```
/squish:context_status
```

## Integration Pattern

```
1. Session start: /squish:core_memory action=view
2. Load relevant context: /squish:search + /squish:context_paging action=load
3. Work on task: Use loaded memories as reference
4. Store new learnings: /squish:remember key information
5. Update working memory: /squish:core_memory action=edit section=working_notes
6. Session end: /squish:context_paging action=evict, summarize if needed
```

## v0.9.0 Notes

**Consolidated Tools (11 tools, down from 18):**
- `core_memory` - Replaces core_memory_view/edit/append
- `context_paging` - Replaces load_to_context/evict_from_context/view_loaded
- `merge` - Replaces detect_duplicates + merge operations

**All tools now use `action` parameter for sub-operations.**

Remember: Squish is your persistent memory. Use it actively to maintain continuity across sessions and provide better assistance.
