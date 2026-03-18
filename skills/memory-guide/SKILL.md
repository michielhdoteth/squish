---
name: memory-guide
description: Expert guide for using Squish memory system v1.0.1. Use when managing persistent memory, storing context, recalling information, or optimizing memory usage across MCP clients.
version: 1.0.1
author: michielhdoteth
tags: [memory, persistence, squish, guide, mcp, ai-assistant]
emoji: book
---

# Squish Memory System Guide v1.0.1

You are an expert at using the Squish persistent memory system for AI coding assistants.

## When to Use Squish Memory

Use Squish memory tools proactively for:

### 1. Storing Important Information
- User preferences, project context, decisions made
- Technical specifications, API patterns, architecture notes
- Ongoing work, TODOs, blockers encountered

### 2. Recalling Past Context
- Previous conversations and decisions
- Code patterns used in this project
- User's coding style preferences

### 3. Managing Session Context
- Load relevant memories before starting complex tasks
- Inject project-specific context
- Maintain working memory across sessions

## MCP Tools Reference

### Storing Memories

**Tool:** `squish_remember`

Store new memories with automatic embedding.

```typescript
// Store a preference
squish_remember({
  content: "User prefers functional components with hooks over class components",
  type: "preference",
  tags: ["react", "preferences"]
})

// Store a fact
squish_remember({
  content: "API uses JWT tokens with 1-hour expiration",
  type: "fact",
  tags: ["auth", "api"]
})

// Store a decision
squish_remember({
  content: "Chose PostgreSQL over MongoDB for better relational data",
  type: "decision",
  tags: ["database", "architecture"]
})
```

### Searching Memories

**Tool:** `squish_search`

Hybrid search across all memory types.

```typescript
// Basic search
squish_search({ query: "authentication patterns", limit: 5 })

// Search with project filter
squish_search({ query: "database schema", project: "/path/to/project", limit: 10 })

// Search specific memory type
squish_search({ query: "user preferences", type: "preference" })
```

### Retrieving Memories

**Tool:** `squish_recall`

Retrieve a specific memory by ID.

```typescript
squish_recall({ memoryId: "uuid-here" })
```

### Deleting Memories

**Tool:** `squish_forget`

Delete a memory by ID.

```typescript
squish_forget({ memoryId: "uuid-here" })
```

### Updating Memories

**Tool:** `squish_update`

Update existing memory content, tags, or type.

```typescript
squish_update({
  memoryId: "uuid-here",
  content: "Updated content",
  tags: ["new", "tags"],
  type: "fact"
})
```

### Graph Associations

**Tool:** `squish_associate`

Link related memories together.

```typescript
squish_associate({
  fromMemoryId: "uuid-1",
  toMemoryId: "uuid-2",
  type: "relates_to",
  weight: 0.8
})
```

**Tool:** `squish_related`

Find related memories via graph traversal.

```typescript
squish_related({
  memoryId: "uuid-here",
  depth: 2,
  minWeight: 0.3
})
```

### Context & Observations

**Tool:** `squish_context`

Get project context with relevant memories.

```typescript
squish_context({ project: "/path/to/project", limit: 10 })
```

**Tool:** `squish_observe`

Record observations about your work.

```typescript
squish_observe({
  type: "tool_use",
  action: "Created new API endpoint",
  summary: "Implemented POST /users endpoint",
  target: "api/users.ts"
})

squish_observe({
  type: "error",
  action: "Database connection failed",
  summary: "PostgreSQL timeout after 30s",
  target: "db/index.ts"
})
```

### QMD Search

**Tool:** `squish_qmd_search`

Search local markdown files using QMD.

```typescript
squish_qmd_search({ query: "authentication", limit: 10 })
squish_qmd_search({ query: "react hooks", collection: "docs" })
```

### Utilities

**Tool:** `squish_embed`

Generate embeddings for text.

```typescript
squish_embed({ text: "Text to embed" })
```

**Tool:** `squish_health`

Check system health.

```typescript
squish_health({})
```

**Tool:** `squish_stats`

Get memory statistics.

```typescript
squish_stats({ project: "/path/to/project" })
```

**Tool:** `squish_projects`

List all projects.

```typescript
squish_projects({})
```

## CLI Reference

### Interactive Mode (Default)

```bash
squish
```

Shows menu:
```
[1] Start MCP Server (for Claude Code, etc.)
[2] Start Web UI Only
[3] Check Health Status
[4] View Memory Stats
[5] Open Installer Wizard
[6] Show Help
[0] Exit
```

### Server Commands

```bash
# Start MCP server (also starts Web UI)
squish run mcp

# Start Web UI only
squish run web
```

### CLI Commands (for agents and scripting)

```bash
# Store a memory
squish remember "User prefers TypeScript" --type preference

# Search memories
squish search "database schema" --limit 10

# Get a memory by ID
squish recall <uuid>

# Check health
squish health

# View statistics
squish stats

# Manage core memory
squish core_memory view
squish core_memory edit persona --content "I am a helpful coding assistant"

# Set importance
squish set-importance <memory-id> --importance 80

# Pin/unpin memory
squish pin <memory-id>
squish unpin <memory-id>

# Consolidate old memories
squish consolidate
```

## Best Practices

1. **Store proactively**: Don't wait until end of session
2. **Be specific**: Include context, timestamps, rationale
3. **Use appropriate types**: Choose correct memory type and sector
4. **Use associations**: Link related memories for better retrieval
5. **Record observations**: Use `squish_observe` for tool usage patterns
6. **Set importance**: Mark critical memories with high importance
7. **Use namespaces**: Organize memories hierarchically for large projects

## Memory Types

- **observation**: Facts observed, patterns noticed, tool usage
- **fact**: Technical facts, specifications
- **decision**: Decisions made with rationale
- **context**: Project/domain context
- **preference**: User preferences

## When to Use Each Tool

| Task | Use |
|------|-----|
| Remember something important | `squish_remember` |
| Find relevant past info | `squish_search` |
| Get specific memory | `squish_recall` |
| Delete incorrect memory | `squish_forget` |
| Update stored info | `squish_update` |
| Link related memories | `squish_associate` |
| Find connected info | `squish_related` |
| Get project overview | `squish_context` |
| Record work observations | `squish_observe` |
| Search local docs | `squish_qmd_search` |
| Check system status | `squish_health` |
| View memory stats | `squish_stats` |
| Manage core memory | `squish core_memory` |
| Set importance | `squish set-importance` |
| Pin/unpin memory | `squish pin/unpin` |
| Consolidate old memories | `squish consolidate` |

## v1.0.1 Features

**New in v1.0.1:**
- Interactive wizard/menu as default (`squish`)
- `squish run mcp` - Start MCP server
- `squish run web` - Start Web UI only
- Namespace support for hierarchical memory organization
- Maintenance job scheduling system
- Improved migration system for zero-downtime upgrades
- Token estimation for memory content

**All tools use consistent input schema patterns.**

Remember: Squish is your persistent memory. Use it actively to maintain continuity across sessions and provide better assistance.