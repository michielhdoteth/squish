---
name: memory-guide
description: Expert guide for using Squish memory system. Use when managing persistent memory, storing context, recalling information, or optimizing memory usage in Claude Code sessions.
---

# Squish Memory System Guide

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

**Tools:** core_memory_view, core_memory_edit, core_memory_append

**Sections:**
- **persona**: Your identity, role, communication style
- **user**: User's name, preferences, coding style, expertise level
- **project**: Current project context, architecture, stack, patterns
- **working**: Active TODOs, current focus, blockers, next steps

**When to update:**
- Beginning of new projects (project section)
- When user shares preferences (user section)
- At end of sessions (working section with TODOs)
- When identity/role changes (persona section)

**Example usage:**
```
/squish:core-memory-append section=project content="Stack: TypeScript, React, PostgreSQL, Drizzle ORM"
/squish:core-memory-edit section=working old="Working on authentication" new="Authentication complete. Next: implement API rate limiting"
```

## Context Paging (Working Set)

**Tools:** load-to-context, view-loaded, evict-from-context, context-status

**Purpose:** Agent-controlled working memory for relevant information during tasks

**When to load memories:**
- Before starting work: Load relevant past decisions, patterns
- During debugging: Load related error memories
- For refactoring: Load architectural notes

**When to evict:**
- Task completed
- Context getting full (check context-status)
- Information no longer relevant

**Example workflow:**
```
# Before starting authentication work
/squish:search query="authentication patterns we discussed"
/squish:load-to-context memoryIds=[id1,id2,id3]

# Check what's loaded
/squish:view-loaded

# After completing task
/squish:evict-from-context memoryIds=[id1,id2]
```

## Storing Memories

**Tool:** remember

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

**Tools:** search, recall, get-related

**Search strategies:**
- Semantic search: Natural language queries
- Full-text search: Specific keywords, file names
- Related memories: Find connected information via association graph

**Example:**
```
/squish:search query="database schema design decisions" limit=5
/squish:recall memoryId=abc123
/squish:get-related memoryId=abc123 limit=10
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
/squish:protect-memory memoryId=abc123
/squish:pin-memory memoryId=abc123
```

## Advanced Features

**Merge duplicates:**
```
/squish:detect-duplicates type=fact
/squish:merge decide=approve mergeProposalId=xyz789
```

**Session summarization:**
```
/squish:summarize-session
```

**Health check:**
```
/squish:health
```

## Integration Pattern

```
1. Session start: Check core_memory_view
2. Load relevant context: search + load-to-context
3. Work on task: Use loaded memories as reference
4. Store new learnings: remember key information
5. Update working memory: core_memory_edit section=working
6. Session end: Evict loaded memories, summarize if needed
```

Remember: Squish is your persistent memory. Use it actively to maintain continuity across sessions and provide better assistance.
