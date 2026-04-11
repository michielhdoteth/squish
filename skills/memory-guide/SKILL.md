---
name: memory-guide
description: Practical guide for using the current Squish memory system across CLI and MCP workflows.
version: 1.1.5
author: michielhdoteth
tags: [memory, persistence, squish, guide, mcp, ai-assistant]
emoji: book
---

# Squish Memory Guide v1.1.5

Use Squish to keep durable project context, user preferences, decisions, and working notes across sessions.

## When To Use It

- Store user preferences, architecture decisions, TODOs, and fixes.
- Search for prior context before making large changes.
- Load project context at the start of a session.
- Record observations and lessons learned while working.

## Core MCP Flows

### Store memory

```typescript
squish_remember({
  content: "API uses JWT tokens with 1-hour expiration",
  type: "fact",
  tags: ["auth", "api"]
})
```

### Search and recall

```typescript
squish_search({ query: "authentication patterns", limit: 5 })
squish_recall({ memoryId: "uuid-here" })
```

### Record a lesson or observation

```typescript
squish_learn({
  type: "observation",
  content: "Implemented POST /users endpoint",
  action: "edit",
  observationType: "insight",
  target: "api/users.ts"
})
```

### Load project context or list projects

```typescript
squish_context({ project: "/path/to/project", limit: 10 })
squish_context({ listProjects: true })
```

### Manage links, confidence, and pinning

```typescript
squish_link({
  action: "add",
  fromMemoryId: "uuid-1",
  toMemoryId: "uuid-2",
  type: "relates_to",
  weight: 0.8
})

squish_confidence({ memoryId: "uuid-here", level: 80 })
squish_pin({ memoryId: "uuid-here" })
```

## Useful CLI Commands

```bash
squish remember "User prefers TypeScript" --type preference
squish note "Ship v1 before adding analytics"
squish learn observation "Updated auth flow" --action edit
squish search "database schema" --limit 10
squish recall <uuid>
squish recent --period 7days
squish link find <memory-id>
squish context --list-projects
squish context
squish health --json
squish stats
```

## Best Practices

1. Store information as you learn it instead of waiting until the end of a session.
2. Prefer `fact`, `decision`, `context`, and `preference` types over dumping everything into generic observations.
3. Use `squish_learn` for work observations, fixes, and outcomes.
4. Use `squish_context` at session start to restore project state.
5. Use `squish_link` when two memories should reinforce each other during retrieval.
6. Pin only the few memories that must never be pruned or consolidated.

## Tool Selection

| Task | Use |
|------|-----|
| Remember something important | `squish_remember` |
| Save a quick raw note | `squish_note` |
| Find relevant past info | `squish_search` |
| Fetch a specific memory | `squish_recall` |
| Update stored info | `squish_update` |
| Delete incorrect memory | `squish_forget` |
| Record a lesson or observation | `squish_learn` |
| Load project overview | `squish_context` |
| List registered projects | `squish_context({ listProjects: true })` |
| Link related memories | `squish_link` |
| View recent memories | `squish_recent` |
| Review stale memories | `squish_stale` |
| Bulk tag memories | `squish_tag` |
| Check system status | `squish_health` |
| View statistics | `squish_stats` |
