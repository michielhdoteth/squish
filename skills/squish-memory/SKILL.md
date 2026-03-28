---
name: squish-memory
description: Squish - Persistent memory system for AI assistants. Store facts, decisions, context, and notes with CLI and MCP workflows.
version: 1.1.0
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, mcp, cli]
emoji: brain
---

# Squish Memory v1.1.0

Persistent memory for AI coding assistants with local SQLite/Postgres storage, hybrid retrieval, and MCP integration.

## Quick Setup

```bash
npm install -g squish-memory

# Start the MCP server
squish run mcp

# Or start the web UI only
squish run web
```

## Skills Available

| Skill | Description | Install |
|-------|-------------|---------|
| `squish-memory` | Overview and quick start | `npx skills add michielhdoteth/squish --skill squish-memory` |
| `squish-mcp` | Current MCP tool reference (18 tools) | `npx skills add michielhdoteth/squish --skill squish-mcp` |
| `squish-cli` | CLI command reference | `npx skills add michielhdoteth/squish --skill squish-cli` |
| `memory-guide` | Usage patterns and best practices | `npx skills add michielhdoteth/squish --skill memory-guide` |

## MCP Tools (18)

- `squish_remember` - Store memory
- `squish_search` - Search memories
- `squish_recall` - Fetch memory by ID
- `squish_forget` - Delete memory
- `squish_update` - Update memory
- `squish_link` - Find, add, or list associations
- `squish_context` - Load project context or list projects
- `squish_learn` - Record success, failure, fix, or observation
- `squish_health` - Check health
- `squish_stats` - View stats
- `squish_confidence` - Get or set confidence
- `squish_pin` - Pin or unpin memory
- `squish_set_passphrase` - Configure encryption passphrase
- `squish_rotate_key` - Rotate encryption key
- `squish_recent` - List recent memories
- `squish_stale` - Show stale memories
- `squish_note` - Save a quick note
- `squish_tag` - Bulk tag operations

## CLI Commands

- `squish` - Interactive wizard
- `squish run mcp` - Start MCP server
- `squish run web` - Start web UI
- `squish config` - View or update config
- `squish remember` - Store memory
- `squish note` - Save quick note
- `squish learn` - Record learnings and observations
- `squish search` - Search memories
- `squish recall` - Search or fetch by ID
- `squish recent` - Show recent memories
- `squish update` - Update memory
- `squish forget` - Delete memory
- `squish pin` - Pin or unpin memory
- `squish confidence` - View or set confidence
- `squish tag` - Bulk tag management
- `squish stale` - Show stale memories
- `squish link` - Graph operations
- `squish context --list-projects` - List projects
- `squish context` - Load project context
- `squish health` - Check service health
- `squish stats` - View statistics

## Example Workflow

```bash
squish remember "User prefers TypeScript over JavaScript" --type preference
squish note "Revisit caching strategy after launch"
squish learn observation "Updated auth flow" --action edit
squish search "coding preferences"
squish context --list-projects
squish context
```

## Configuration

| Env Variable | Description | Default |
|--------------|-------------|---------|
| `SQUISH_MODE` | local or team | `local` |
| `SQUISH_DATA_DIR` | Data directory | `.squish` in current workspace |
| `SQUISH_EMBEDDINGS_PROVIDER` | `local`, `openai`, `ollama`, `google`, `none`, `auto` | `local` |
| `SQUISH_QMD_ENABLED` | Enable QMD integration | `false` unless set |

## More Info

- GitHub: https://github.com/michielhdoteth/squish
- npm: https://www.npmjs.com/package/squish-memory
- Docs: https://github.com/michielhdoteth/squish/tree/main/docs
