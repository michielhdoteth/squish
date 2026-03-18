# Squish CLI Reference

Complete reference for Squish CLI commands.

## Overview

Squish v1.0.2 provides both an interactive wizard (default) and direct CLI commands for agents.

## Interactive Mode (Default)

Running `squish` without arguments launches the interactive wizard:

```bash
squish
```

**Interactive Menu:**
```
[1] Start MCP Server (for Claude Code, etc.)
[2] Start Web UI Only
[3] Check Health Status
[4] View Memory Stats
[5] Open Installer Wizard
[6] Show Help
[0] Exit
```

## Server Commands

### squish run mcp

Start the MCP server (for Claude Code, OpenCode, etc.):

```bash
squish run mcp
```

Also starts the Web UI at http://localhost:37777

### squish run web

Start only the Web UI:

```bash
squish run web
```

Access at http://localhost:37777

## CLI Commands (for Agents)

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

### squish --help

Show help information.

```bash
squish --help
```

## Output Format

All CLI commands output JSON:

```json
{
  "ok": true,
  "id": "memory-uuid",
  "content": "...",
  "type": "observation"
}
```

## Environment Variables

```bash
export SQUISH_MODE=local        # or team
export SQUISH_DATA_DIR=~/.squish
export SQUISH_EMBEDDINGS_PROVIDER=local  # or openai
```

## Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `squish` | Interactive wizard | `squish` |
| `squish run mcp` | Start MCP server | `squish run mcp` |
| `squish run web` | Start Web UI | `squish run web` |
| `squish remember` | Store memory | `squish remember "text"` |
| `squish search` | Find memories | `squish search "query"` |
| `squish recall` | Get by ID | `squish recall <id>` |
| `squish health` | Check status | `squish health` |
| `squish stats` | View stats | `squish stats` |
| `squish --help` | Show help | `squish --help` |

## Migration from v0.9.x

**Breaking Changes:**
- `squish install` removed - use interactive wizard (option 5) instead
- Added `squish run mcp` and `squish run web` subcommands
- Interactive wizard is now the default (no args)

**What stays the same:**
- All CLI commands (`remember`, `search`, `recall`, `health`, `stats`)
- Environment variables
- Configuration files
