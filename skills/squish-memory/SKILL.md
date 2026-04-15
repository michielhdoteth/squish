---
name: squish-memory
description: Squish - Persistent memory system for AI assistants. Store facts, decisions, context, and notes with CLI and MCP workflows.
version: 1.1.6
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, mcp, cli]
emoji: brain
---

# Squish Memory v1.1.6

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
| `squish-cli` | CLI command reference | `npx skills add michielhdoteth/squish --skill squish-cli` |
| `memory-guide` | Usage patterns and best practices | `npx skills add michielhdoteth/squish --skill memory-guide` |

## MCP Tools (17) - Unified Write Path

**THE memory write tool for agents: `squish_remember`**
- Auto-detects memory vs learning routing
- Supports hot/cold tiers
- Handles all memory types

| Tool | Purpose | Typical Input |
|------|---------|---------------|
| `squish_remember` | **RECOMMENDED** - Unified memory write with auto-detection | `content`, `project`, `tags`, `tier`, `type`, `route` |
| `squish_search` | Search memories | `query`, optional `limit`, `project`, `mode` |
| `squish_recall` | Fetch memory by ID | `memoryId` |
| `squish_forget` | Delete memory | `memoryId` or bulk filters |
| `squish_update` | Update memory | `memoryId`, changed fields |
| `squish_link` | Graph operations | `action`, memory IDs |
| `squish_context` | Load project context | `project`, `limit` |
| `squish_health` | Check health | - |
| `squish_stats` | View stats | `project` |
| `squish_confidence` | Get or set confidence | `memoryId`, `level` |
| `squish_pin` | Pin or unpin memory | `memoryId`, `pinned` |
| `squish_set_passphrase` | Configure encryption | `passphrase` |
| `squish_rotate_key` | Rotate encryption key | - |
| `squish_recent` | List recent memories | `project`, `limit` |
| `squish_stale` | Show stale memories | `project` |
| `squish_tag` | Bulk tag operations | - |
| `squish_timeline` | Progressive disclosure | `query`, `depth` |

## CLI Commands

- `squish` - Interactive wizard
- `squish run mcp` - Start MCP server
- `squish run web` - Start web UI
- `squish config` - View or update config
- `squish remember` - **RECOMMENDED** - Store memory/learning with auto-detection
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
- `squish context` - Load project context
- `squish health` - Check service health
- `squish stats` - View statistics

## Example Workflow

```bash
# Unified remember - auto-detects routing
squish remember "Failed because the API returned 404" --project /myproject
squish remember "User prefers TypeScript over JavaScript" --type preference
squish remember "Important decision made" --tier hot --type decision

# Search and retrieve
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
