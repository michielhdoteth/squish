---
name: squish-memory
description: Persistent memory system for Claude Code. Use when you need to store, recall, or search project memories, facts, decisions, and learnings across sessions. Triggers on: remember, recall, memory, forget, search memories, store context, project knowledge, what did we decide, previous conversation.
when_to_use: User mentions memory, recall, remember, forget, search memories, store context, project knowledge, prior decisions, past conversations
allowed-tools: Bash
---

# Squish Memory

Persistent memory system using the Squish CLI. Auto-captures context and provides durable memory across sessions.

## Auto-Install

If `squish` is not on PATH, run:
```bash
npm install -g squish-memory && squish install --all
```

## Commands

### Store Memory
```bash
squish remember "content" --type observation --project .
```

Types: `observation`, `fact`, `decision`, `context`, `preference`, `note`

Places: `inbox`, `wip`, `ref`, `sandbox`, `board`, `sparks`, `archive`

### Recall Memory
```bash
squish recall "query" --limit 5 --project .
```

### Load Context
```bash
squish context --json --limit 5 --project .
```

### Recent Memories
```bash
squish recent --period today --project .
```

### Memory Stats
```bash
squish stats --project .
```

### Health Check
```bash
squish health --json
```

## Workflow

1. **Before starting work**: `squish context` for prior context
2. **During work**: `squish remember` for decisions and observations
3. **After work**: `squish remember` for learnings and outcomes

## Example

```bash
# Store a decision
squish remember "We chose PostgreSQL for team mode" --type decision

# Recall related memories
squish recall "database choice"

# Load context for current project
squish context
```
