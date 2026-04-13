---
name: squish-mcp
description: Squish MCP tools for Claude Code, OpenCode, Cursor and other MCP clients. Current release exposes 18 tools for memory storage, retrieval, and maintenance.
version: 1.1.6
author: michielhdoteth
tags: [mcp, memory, persistence, search, semantic-search, claude-code, opencode, cursor]
emoji: plug
---

# Squish MCP Tools v1.1.6 (18 Tools)

Use these MCP tools when working with Claude Code, OpenCode, Cursor, or any MCP-compatible client.

## Install

```bash
npx add-mcp squish-memory
```

Or install globally and run directly:

```bash
npm install -g squish-memory
squish run mcp
```

The MCP command is `squish-mcp`. The web UI runs separately via `squish run web`.

## Tool Reference

| Tool | Purpose | Typical Input |
|------|---------|---------------|
| `squish_remember` | Store a memory | `content`, optional `type`, `tags`, `project` |
| `squish_search` | Search memories | `query`, optional `limit`, `project`, `mode` |
| `squish_recall` | Fetch memory by ID | `memoryId` |
| `squish_forget` | Delete one or many memories | `memoryId` or bulk filters |
| `squish_update` | Update memory fields | `memoryId`, changed fields |
| `squish_link` | Find, add, or list associations | `action`, plus memory IDs when needed |
| `squish_context` | Load project context or list projects | `project`, `limit`, `listProjects` |
| `squish_learn` | Record success, failure, fix, or observation | `type`, `content`, optional `action`, `context` |
| `squish_health` | Check system health | no input |
| `squish_stats` | Get memory statistics | optional `project` |
| `squish_confidence` | Get or set confidence | `memoryId`, optional `level` |
| `squish_pin` | Pin or unpin a memory | `memoryId`, optional `pinned`/mode |
| `squish_set_passphrase` | Configure encryption passphrase | passphrase input |
| `squish_rotate_key` | Rotate encryption key | new passphrase input |
| `squish_recent` | List recent memories | optional filters |
| `squish_stale` | Show stale memories | optional thresholds |
| `squish_note` | Save a quick note | `content`, optional `project` |
| `squish_tag` | Bulk tag operations | `action`, `tag`, filters |

## Common Patterns

### Store a memory

```typescript
squish_remember({
  content: "User prefers functional React components",
  type: "preference",
  tags: ["react", "preferences"]
})
```

### Record an observation or lesson

```typescript
squish_learn({
  type: "observation",
  content: "Updated auth flow to use refresh tokens",
  action: "edit",
  observationType: "insight",
  target: "src/auth.ts"
})
```

### Search and load context

```typescript
squish_search({ query: "authentication", limit: 5 })
squish_context({ project: "/path/to/project", limit: 10 })
squish_context({ listProjects: true })
```

### Manage graph links

```typescript
squish_link({
  action: "add",
  fromMemoryId: "uuid-1",
  toMemoryId: "uuid-2",
  type: "relates_to",
  weight: 0.8
})
```

## Notes

- Project listing is handled through `squish_context({ listProjects: true })`.
- Observations and lessons are recorded through `squish_learn({ type: "observation", ... })`.
