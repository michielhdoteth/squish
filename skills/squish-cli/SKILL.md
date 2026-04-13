---
name: squish-cli
description: Squish CLI commands for OpenClaw and other CLI-based agents. Use for bash execution, scripting, and automation.
version: 1.1.6
author: michielhdoteth
tags: [cli, memory, persistence, command-line, openclaw, bash, automation]
emoji: terminal
---

# Squish CLI Commands

Use these CLI commands when MCP is not available or when working with OpenClaw, CLI-based agents, or bash scripting.

## Install

```bash
npm install -g @squish/memory
# or
bun add -g @squish/memory
```

## Overview

Squish v1.1.6 introduces a new interaction model:
- **Default (`squish`)**: Interactive wizard/menu
- **Server modes**: `squish run mcp` and `squish run web`
- **CLI commands**: For agents and scripting (unchanged)

## Commands

### squish remember

Store a memory.

```bash
squish remember "User prefers TypeScript" --type preference
squish remember "API uses JWT tokens" --type fact --tags auth,api
squish remember "Chose PostgreSQL" --type decision --project /path/to/project
```

Options:
- `-t, --type <type>` - Memory type: observation, fact, decision, context, preference (default: observation)
- `-T, --tags <tags>` - Comma-separated tags
- `-p, --project <project>` - Project path (default: current directory)

### squish search

Search memories.

```bash
squish search "authentication patterns"
squish search "database schema" --limit 10
squish search "user preferences" --type preference
squish search "" --project /path/to/project  # List recent
```

Options:
- `-t, --type <type>` - Filter by memory type
- `-l, --limit <number>` - Max results (default: 10)
- `-p, --project <project>` - Project path

### squish recall

Retrieve a memory by ID.

```bash
squish recall <memory-uuid>
```

### squish core_memory

Manage core memory (always-visible context).

```bash
# View all sections
squish core_memory view

# Edit a section
squish core_memory edit persona --content "I am a helpful coding assistant"
squish core_memory edit user_info --content "User likes TypeScript"
squish core_memory edit project_context --content "Stack: React, Node.js, PostgreSQL"
squish core_memory edit working_notes --content "TODO: Implement auth"

# Append to a section
squish core_memory append user_info --text "Also prefers dark mode"
```

Options:
- `-s, --section <section>` - Section: persona, user_info, project_context, working_notes
- `-c, --content <content>` - New content (for edit)
- `-t, --text <text>` - Text to append (for append)
- `-p, --project <project>` - Project path

### squish set-importance

Set importance score (0-100).

```bash
squish set-importance <memory-id> --importance 80
```

### squish pin / squish unpin

Pin/unpin memory to prevent pruning.

```bash
squish pin <memory-id>
squish unpin <memory-id>
```

### squish consolidate

Trigger manual memory consolidation.

```bash
squish consolidate
squish consolidate --project-id <project-id>
squish consolidate --min-age 30 --threshold 0.8
```

Options:
- `-p, --project-id <id>` - Project ID (default: current directory)
- `-a, --min-age <number>` - Minimum age in days (default: 90)
- `-i, --max-importance <number>` - Max importance to consolidate (default: 30)
- `-t, --threshold <number>` - Similarity threshold 0-1 (default: 0.7)
- `-l, --limit <number>` - Max memories to process (default: 100)

### squish consolidation-stats

Get consolidation statistics.

```bash
squish consolidation-stats
squish consolidation-stats --project-id <project-id>
```

### squish health

Check service health.

```bash
squish health
squish health --json
```

### squish stats

Get memory statistics.

```bash
squish stats
squish stats --project /path/to/project
```

### squish

Interactive wizard/menu (default when no args provided).

```bash
squish
```

Shows interactive menu:
```
[1] Start MCP Server (for Claude Code, etc.)
[2] Start Web UI Only
[3] Check Health Status
[4] View Memory Stats
[5] Open Installer Wizard
[6] Show Help
[0] Exit
```

### squish run mcp

Start MCP server (also starts Web UI):

```bash
squish run mcp
```

### squish run web

Start Web UI only:

```bash
squish run web
```

## Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `squish` | Interactive wizard/menu | `squish` |
| `squish run mcp` | Start MCP server | `squish run mcp` |
| `squish run web` | Start Web UI only | `squish run web` |
| `squish remember` | Store memory | `squish remember "text"` |
| `squish search` | Find memories | `squish search "query"` |
| `squish recall` | Get by ID | `squish recall <id>` |
| `squish core_memory` | Manage context | `squish core_memory view` |
| `squish set-importance` | Set score | `squish set-importance <id> 80` |
| `squish pin/unpin` | Prevent pruning | `squish pin <id>` |
| `squish consolidate` | Summarize old | `squish consolidate` |
| `squish health` | Check status | `squish health` |
| `squish stats` | View stats | `squish stats` |

## Output Format

All commands output JSON by default:

```json
{
  "ok": true,
  "id": "memory-uuid",
  "content": "...",
  "type": "observation"
}
```

Use `--json` flag where available for JSON output.

## Environment

```bash
export SQUISH_MODE=local        # or team
export SQUISH_DATA_DIR=~/.squish
export SQUISH_EMBEDDINGS_PROVIDER=local  # or openai
```

## Migration from v0.9.x

**Breaking Changes:**
- `squish install` removed (replaced by interactive wizard option 5)
- `squish` now shows interactive menu (was MCP server + Web UI)
- Added `squish run mcp` and `squish run web` subcommands

**What stays the same:**
- All CLI command syntax and options
- Environment variables
- Configuration files