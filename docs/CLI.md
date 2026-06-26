# Squish CLI Reference

Current reference for the shipped CLI in `packages/cli/src/index.ts`.

## Overview

Squish exposes a compact operational CLI:

- runtime commands for the Web UI, plus a dedicated `squish-mcp` binary
- direct commands for explicit save, retrieval, inspection, and diagnostics
- project/runtime visibility commands for trust and release debugging

## Runtime

### squish-mcp

Start the MCP server for Claude Code, Codex, Cursor, OpenCode, and other MCP clients:

```bash
squish-mcp
squish-mcp --health
```

### squish run web

Start only the Web UI:

```bash
squish run web
```

## Memory Capture And Retrieval

### squish remember

Store an explicit memory:

```bash
squish remember "User prefers TypeScript" --type preference
squish remember "Chose PostgreSQL for Squish Cloud team mode" --type decision --project /path/to/project
```

### squish recall

Recall by query or memory ID:

```bash
squish recall "user preferences"
squish recall "authentication patterns" --limit 10
squish recall 123e4567-e89b-12d3-a456-426614174000
```

### squish recent

Show recent memory activity:

```bash
squish recent --period today
squish recent --period 7days
```

### squish inspect

Explain why a memory exists and whether extra runtime metadata exists:

```bash
squish inspect <memory-id>
squish inspect <memory-id> --json
```

## Context And Diagnostics

### squish context

Show current project context or list projects:

```bash
squish context
squish context --json
squish context --list-projects
```

### squish health

Show trust-oriented runtime health:

```bash
squish health
squish health --json
```

### squish stats

Show durable totals plus capture-era signal telemetry:

```bash
squish stats
squish stats --json
```

### squish doctor

Run combined trust + diagnostics checks:

```bash
squish doctor
squish doctor --json
squish doctor --verbose
```

## Session Search

Search previous agent runs from Claude Code, Codex, and OpenCode. Sessions are separate from long-term memory -- they are raw evidence from past work.

### squish sessions list

List past sessions across all available agent stores:

```bash
squish sessions list
squish sessions list --limit 10
squish sessions list --source claude-code
squish sessions list --source codex
squish sessions list --project /path/to/project
```

### squish sessions search

Full-text search across session history. Returns matching chunks (decisions, commands, file changes, errors) not whole sessions:

```bash
squish sessions search "postgres migration"
squish sessions search "auth bug" --source claude-code --limit 5
squish sessions search "deploy" --depth deep
squish sessions search "pricing" --chunk-type decision
```

### squish sessions show

Display full detail for a specific session:

```bash
squish sessions show <session-id>
squish sessions show <session-id> --source codex
```

### squish sessions related

Find past sessions relevant to the current repo or specific files:

```bash
squish sessions related --repo-path /path/to/repo
squish sessions related --file src/auth.ts,src/db.ts
squish sessions related --limit 5
```

### squish sessions capture

Record a session summary manually:

```bash
squish sessions capture "Implemented OAuth flow" --title "Auth work" --project /path/to/project
```

### squish sessions status

Show which agent stores are available and their health:

```bash
squish sessions status
squish sessions status --pretty
```

## Maintenance

### squish forget

Delete a memory:

```bash
squish forget <memory-id>
```

### squish link

Manage associations:

```bash
squish link find <memory-id>
squish link add <from-id> <to-id> related
squish link list <memory-id>
```

### squish stale

Show stale memories:

```bash
squish stale --days 30
```

### squish clean

Run cleanup / maintenance tasks:

```bash
squish clean
```

### squish migrate

Unify multiple local `.squish` folders into the current workspace location:

```bash
squish migrate
```

## Quick Reference

| Family | Commands |
|--------|----------|
| Runtime | `squish-mcp`, `squish run web` |
| Capture / Retrieval | `squish remember`, `squish recall`, `squish recent`, `squish inspect` |
| Session Search | `squish sessions list`, `squish sessions search`, `squish sessions show`, `squish sessions related`, `squish sessions capture`, `squish sessions status` |
| Context / Trust | `squish context`, `squish health`, `squish stats`, `squish doctor` |
| Maintenance | `squish forget`, `squish link`, `squish stale`, `squish clean`, `squish migrate` |
