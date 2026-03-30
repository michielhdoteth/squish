# Squish CLI Reference

Current reference for the Squish CLI implemented in `squish/index.ts`.

## Overview

Squish provides:

- An interactive wizard when you run `squish`
- Runtime commands for MCP and Web UI
- Direct CLI commands for capture, retrieval, context, and memory management

## Setup / Runtime

### squish

Launch the interactive wizard:

```bash
squish
```

### squish config

Manage persisted Squish configuration:

```bash
squish config
squish config get project
squish config set project /path/to/project
```

### squish install

Launch the installer wizard directly:

```bash
squish install
```

### squish run mcp

Start the MCP server for Claude Code, OpenCode, Codex, and other MCP clients:

```bash
squish run mcp
```

### squish run web

Start only the Web UI:

```bash
squish run web
```

## Capture / Retrieval

### squish remember

Store a memory:

```bash
squish remember "User prefers TypeScript" --type preference
squish remember "API uses JWT tokens" --type fact --tags auth,api
squish remember "Chose PostgreSQL" --type decision --project /path/to/project
```

Options:
- `-t, --type <type>` memory type: `observation`, `fact`, `decision`, `context`, `preference`
- `-T, --tags <tags>` comma-separated tags
- `-p, --project <project>` project path

### squish note

Save a quick brain dump for later processing:

```bash
squish note "Revisit caching strategy after launch"
```

Options:
- `-p, --project <project>` project path

### squish learn

Record structured learning and observations:

```bash
squish learn success "Shipped MCP config to Claude Code"
squish learn failure "Rate limiter blocked valid webhook traffic"
squish learn fix "Patched auth middleware" --target middleware.ts
squish learn observation "Updated auth flow" --action edit
```

Options:
- `-c, --context <context>` extra context
- `-a, --action <action>` action performed when type is `observation`
- `-o, --observation-type <kind>` observation kind for `observation` mode
- `-t, --target <target>` target file or resource
- `-p, --project <project>` project path

Valid types:
- `success`
- `failure`
- `fix`
- `observation`

### squish search

Search memories:

```bash
squish search "authentication patterns"
squish search "database schema" --limit 10
squish search "user preferences" --type preference
```

Options:
- `-t, --type <type>` filter by memory type
- `-l, --limit <number>` max results
- `-p, --project <project>` project path
- `-s, --since <date>` created after date
- `-u, --until <date>` created before date

### squish recall

Search by query or fetch by memory ID:

```bash
squish recall "user preferences"
squish recall 123e4567-e89b-12d3-a456-426614174000
```

Options:
- `-l, --limit <number>` max results
- `-t, --type <type>` filter by type
- `-p, --project <project>` project path
- `-s, --since <date>` created after date
- `-u, --until <date>` created before date

### squish recent

Show recent memories:

```bash
squish recent --period today
squish recent --period 7days
squish recent --since "2026-01-01" --until "2026-01-31"
```

## Memory Management

### squish update

Update an existing memory:

```bash
squish update <memory-id> --content "Updated text"
```

### squish forget

Delete a memory or bulk-delete matches:

```bash
squish forget <memory-id>
squish forget --search "stale auth notes" --confirm
```

### squish pin

Pin or unpin a memory:

```bash
squish pin <memory-id>
squish pin <memory-id> --unpin
```

### squish confidence

View or set confidence:

```bash
squish confidence <memory-id>
squish confidence <memory-id> certain
```

### squish tag

Bulk add or remove tags:

```bash
squish tag add important --search "billing"
squish tag remove stale --older-than "30 days"
```

### squish stale

Show stale memories:

```bash
squish stale --days 30
```

### squish link

Manage associations:

```bash
squish link find <memory-id>
squish link add <from-id> <to-id> related
squish link list <memory-id>
```

## Context / Project Discovery

### squish context

Show project context or list registered projects:

```bash
squish context --list-projects
squish context
squish context --include memories,observations,entities
squish context --json
```

## System

### squish health

Check service health:

```bash
squish health
squish health --json
```

### squish stats

Get memory statistics:

```bash
squish stats
squish stats --project /path/to/project
```

## Quick Reference

| Family | Commands |
|--------|----------|
| Setup / Runtime | `squish`, `squish config`, `squish install`, `squish run mcp`, `squish run web` |
| Capture / Retrieval | `squish remember`, `squish note`, `squish learn`, `squish search`, `squish recall`, `squish recent` |
| Memory Management | `squish update`, `squish forget`, `squish pin`, `squish confidence`, `squish tag`, `squish stale`, `squish link` |
| Context / Projects | `squish context --list-projects`, `squish context` |
| System | `squish health`, `squish stats` |
