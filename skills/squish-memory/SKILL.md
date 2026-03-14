---
name: squish-memory
description: Persistent memory system with semantic search for AI assistants. Store and retrieve information across sessions with hybrid search (BM25 + embeddings). Works with Claude Code, OpenCode, OpenClaw, and any MCP client.
version: 0.9.0
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, mcp, claude-code, openclaw, opencode, embeddings]
emoji: brain
---

# Squish Memory v0.9.0

Persistent memory system for AI coding assistants. Store facts, decisions, context, and preferences with semantic search.

## Quick Install

```bash
npm install -g squish-memory
# or
bun add -g squish-memory
```

## Client Setup

### Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": [],
      "env": {
        "SQUISH_MODE": "local",
        "SQUISH_DATA_DIR": "~/.squish"
      }
    }
  }
}
```

### OpenCode

Add to `opencode.json`:

```json
{
  "mcp": {
    "squish": {
      "type": "local",
      "command": ["squish-mcp"],
      "enabled": true,
      "environment": {
        "SQUISH_MODE": "local"
      }
    }
  }
}
```

### OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": [],
      "env": {
        "SQUISH_MODE": "local"
      },
      "transport": "stdio"
    }
  }
}
```

### Direct MCP Command

```bash
squish-mcp
```

## MCP Tools (16 Tools)

### Core Memory Tools

#### 1. squish_remember
Store a new memory in Squish with automatic embedding.

```typescript
{
  name: "squish_remember",
  input: {
    content: string,           // Required: Memory content
    type: "observation" | "fact" | "decision" | "context" | "preference",
    tags?: string[],
    project?: string
  }
}
```

**Example:**
```
squish_remember({
  content: "User prefers TypeScript over JavaScript",
  type: "preference",
  tags: ["typescript", "preferences"]
})
```

#### 2. squish_search
Hybrid search across QMD, SQLite DB, and embeddings with graph expansion.

```typescript
{
  name: "squish_search",
  input: {
    query: string,            // Required: Search query
    limit?: number,          // Default: 5, Max: 100
    project?: string,         // Project path filter
    mode?: "hybrid" | "qmd" | "db" | "semantic"
  }
}
```

#### 3. squish_recall
Retrieve a specific memory by ID.

```typescript
{
  name: "squish_recall",
  input: {
    memoryId: string          // UUID of memory to retrieve
  }
}
```

#### 4. squish_forget
Delete a memory by ID.

```typescript
{
  name: "squish_forget",
  input: {
    memoryId: string          // UUID of memory to delete
  }
}
```

#### 5. squish_update
Update an existing memory.

```typescript
{
  name: "squish_update",
  input: {
    memoryId: string,
    content?: string,
    tags?: string[],
    type?: "observation" | "fact" | "decision" | "context" | "preference"
  }
}
```

### Graph & Association Tools

#### 6. squish_associate
Create an association between two memories in the graph.

```typescript
{
  name: "squish_associate",
  input: {
    fromMemoryId: string,     // Source memory UUID
    toMemoryId: string,       // Target memory UUID
    type: "relates_to" | "supersedes" | "contradicts" | "supports" | "duplicate" | "merged",
    weight?: number           // 0-1, default 0.5
  }
}
```

#### 7. squish_related
Get related memories via graph traversal.

```typescript
{
  name: "squish_related",
  input: {
    memoryId: string,
    depth?: number,           // 1-5, default 2
    minWeight?: number        // 0-1, default 0.3
  }
}
```

### Context & Observation Tools

#### 8. squish_context
Get project context with relevant memories.

```typescript
{
  name: "squish_context",
  input: {
    project: string,          // Required: Project path
    limit?: number             // Max memories, default 10
  }
}
```

#### 9. squish_observe
Store an observation about tool usage, patterns, or insights.

```typescript
{
  name: "squish_observe",
  input: {
    type: "tool_use" | "file_change" | "error" | "pattern" | "insight",
    action: string,           // Action performed
    summary: string,          // Summary of observation
    target?: string,          // Target file or resource
    project?: string
  }
}
```

### Search Tools

#### 10. squish_qmd_search
Search markdown files using QMD (BM25 + vector).

```typescript
{
  name: "squish_qmd_search",
  input: {
    query: string,
    collection?: string,      // QMD collection name
    limit?: number            // Default: 10
  }
}
```

### Utility Tools

#### 11. squish_embed
Generate embeddings for text using configured provider.

```typescript
{
  name: "squish_embed",
  input: {
    text: string              // Text to embed
  }
}
```

#### 12. squish_health
Check Squish system health status. No input required.

#### 13. squish_stats
Get memory statistics for a project.

```typescript
{
  name: "squish_stats",
  input: {
    project?: string          // Defaults to current directory
  }
}
```

#### 14. squish_projects
List all registered projects. No input required.

---

## CLI Commands (Fallback)

When MCP is not available, use the CLI:

```bash
# Store a memory
squish remember "User prefers dark mode" --type preference
squish remember "API uses JWT tokens" --type fact

# Search memories
squish search "authentication patterns"
squish search "database schema" --limit 5

# Recall by ID
squish recall <memory-id>

# Core memory management
squish core_memory view
squish core_memory edit persona --content "I am a helpful coding assistant"
squish core_memory append user_info --text "User likes TypeScript"

# Importance & pinning
squish set-importance <memory-id> --importance 80
squish pin <memory-id>
squish unpin <memory-id>

# Health & stats
squish health
squish stats

# Consolidation
squish consolidate --project-id <id>
squish consolidation-stats

# Self-install for OpenClaw
squish install
```

---

## Memory Types

- **observation**: Patterns noticed, tool usage, errors
- **fact**: Technical facts, specifications, API details
- **decision**: Choices made with reasoning
- **context**: Project/domain information
- **preference**: User preferences, coding style

---

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SQUISH_MODE` | "local" or "team" | "local" |
| `SQUISH_DATA_DIR` | Custom data directory | `~/.squish` |
| `SQUISH_EMBEDDINGS_PROVIDER` | "local" or "openai" | "local" |
| `SQUISH_MCP_MODE` | "stdio" or "http" | "stdio" |

---

## Troubleshooting

```bash
# Check installation
squish health

# Check data directory
ls ~/.squish

# Reinstall for specific client
npx squish-memory install claude
npx squish-memory install opencode
npx squish-memory install openclaw
```

---

## More Information

- GitHub: https://github.com/michielhdoteth/squish
- npm: https://www.npmjs.com/package/squish-memory
