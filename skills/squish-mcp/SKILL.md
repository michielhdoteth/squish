---
name: squish-mcp
description: Squish MCP tools for Claude Code, OpenCode, Cursor and other MCP clients. 16 tools for persistent memory storage, search, and context management.
version: 1.0.1
author: michielhdoteth
tags: [mcp, memory, persistence, search, semantic-search, claude-code, opencode, cursor]
emoji: plug
---

# Squish MCP Tools

Use these MCP tools when working with Claude Code, OpenCode, Cursor, or any MCP-compatible client.

## Install

```bash
npm install -g squish-memory
```

Then start the MCP server:
```bash
squish run mcp
```

This will also start the Web UI at http://localhost:37777

Configure in your client's MCP settings:
- **Command**: `squish-mcp`
- **Args**: (none needed)
- **Environment**: 
  - `SQUISH_MODE=local` or `team`
  - `SQUISH_DATA_DIR=~/.squish`

## MCP Tools (16 Tools)

### 1. squish_remember
Store a new memory with automatic embedding.

```typescript
{
  name: "squish_remember",
  description: "Store a new memory in Squish with automatic embedding",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Memory content to store" },
      type: { 
        type: "string", 
        enum: ["observation", "fact", "decision", "context", "preference"],
        description: "Memory type (default: observation)"
      },
      tags: { 
        type: "array", 
        items: { type: "string" },
        description: "Optional tags" 
      },
      project: { type: "string", description: "Project path" }
    },
    required: ["content"]
  }
}
```

### 2. squish_search
Hybrid search across QMD, SQLite DB, and embeddings.

```typescript
{
  name: "squish_search",
  description: "Hybrid search across QMD, SQLite DB, and embeddings with graph expansion",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results (default: 5, max: 100)" },
      project: { type: "string", description: "Project path filter" },
      mode: { 
        type: "string", 
        enum: ["hybrid", "qmd", "db", "semantic"],
        description: "Search mode (default: hybrid)"
      }
    },
    required: ["query"]
  }
}
```

### 3. squish_recall
Retrieve a specific memory by ID.

```typescript
{
  name: "squish_recall",
  description: "Retrieve a specific memory by ID",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "Memory UUID to retrieve" }
    },
    required: ["memoryId"]
  }
}
```

### 4. squish_forget
Delete a memory by ID.

```typescript
{
  name: "squish_forget",
  description: "Delete a memory by ID",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "Memory UUID to delete" }
    },
    required: ["memoryId"]
  }
}
```

### 5. squish_update
Update an existing memory.

```typescript
{
  name: "squish_update",
  description: "Update an existing memory",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "Memory UUID to update" },
      content: { type: "string", description: "New content" },
      tags: { type: "array", items: { type: "string" }, description: "New tags" },
      type: { 
        type: "string", 
        enum: ["observation", "fact", "decision", "context", "preference"],
        description: "New type" 
      }
    },
    required: ["memoryId"]
  }
}
```

### 6. squish_associate
Create association between two memories.

```typescript
{
  name: "squish_associate",
  description: "Create an association between two memories in the graph",
  inputSchema: {
    type: "object",
    properties: {
      fromMemoryId: { type: "string", description: "Source memory UUID" },
      toMemoryId: { type: "string", description: "Target memory UUID" },
      type: { 
        type: "string",
        enum: ["relates_to", "supersedes", "contradicts", "supports", "duplicate", "merged"],
        description: "Association type"
      },
      weight: { type: "number", description: "Strength 0-1 (default: 0.5)" }
    },
    required: ["fromMemoryId", "toMemoryId", "type"]
  }
}
```

### 7. squish_related
Find related memories via graph.

```typescript
{
  name: "squish_related",
  description: "Get related memories via graph traversal",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "Memory UUID" },
      depth: { type: "number", description: "Graph depth 1-5 (default: 2)" },
      minWeight: { type: "number", description: "Min weight 0-1 (default: 0.3)" }
    },
    required: ["memoryId"]
  }
}
```

### 8. squish_context
Get project context.

```typescript
{
  name: "squish_context",
  description: "Get project context with relevant memories",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project path" },
      limit: { type: "number", description: "Max memories (default: 10)" }
    },
    required: ["project"]
  }
}
```

### 9. squish_observe
Record observations.

```typescript
{
  name: "squish_observe",
  description: "Store an observation about tool usage, patterns, or insights",
  inputSchema: {
    type: "object",
    properties: {
      type: { 
        type: "string",
        enum: ["tool_use", "file_change", "error", "pattern", "insight"],
        description: "Observation type"
      },
      action: { type: "string", description: "Action performed" },
      summary: { type: "string", description: "Summary of observation" },
      target: { type: "string", description: "Target file or resource" },
      project: { type: "string", description: "Project path" }
    },
    required: ["type", "action", "summary"]
  }
}
```

### 10. squish_qmd_search
Search markdown files.

```typescript
{
  name: "squish_qmd_search",
  description: "Search markdown files using QMD (BM25 + vector)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      collection: { type: "string", description: "QMD collection name" },
      limit: { type: "number", description: "Max results (default: 10)" }
    },
    required: ["query"]
  }
}
```

### 11. squish_embed
Generate embeddings.

```typescript
{
  name: "squish_embed",
  description: "Generate embeddings for text using configured provider",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to embed" }
    },
    required: ["text"]
  }
}
```

### 12. squish_health
Check system health. No input required.

```typescript
{
  name: "squish_health",
  description: "Check system health",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 13. squish_stats
Get memory statistics.

```typescript
{
  name: "squish_stats",
  description: "Get memory statistics for a project",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project path (defaults to current)" }
    }
  }
}
```

### 14. squish_projects
List all projects. No input required.

```typescript
{
  name: "squish_projects",
  description: "List all projects",
  inputSchema: {
    type: "object"
  }
}
```

## Quick Reference

| Tool | Purpose | Required Input |
|------|---------|----------------|
| squish_remember | Store memory | content |
| squish_search | Find memories | query |
| squish_recall | Get by ID | memoryId |
| squish_forget | Delete memory | memoryId |
| squish_update | Edit memory | memoryId |
| squish_associate | Link memories | fromMemoryId, toMemoryId, type |
| squish_related | Find related | memoryId |
| squish_context | Project overview | project |
| squish_observe | Record observation | type, action, summary |
| squish_qmd_search | Search docs | query |
| squish_embed | Generate embedding | text |
| squish_health | Check status | - |
| squish_stats | View stats | project (optional) |
| squish_projects | List projects | - |

## Configuration

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "env": {
        "SQUISH_MODE": "local",
        "SQUISH_DATA_DIR": "~/.squish"
      }
    }
  }
}
```

## Migration from v0.9.x

**Breaking Changes:**
- Added `squish run mcp` and `squish run web` commands to start servers
- The `squish` command now shows interactive wizard (was MCP server + Web UI)

**What stays the same:**
- All MCP tool names and schemas
- Environment variables
- Configuration format