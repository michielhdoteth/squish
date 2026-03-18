---
name: squish-memory
description: Squish - Persistent memory system for AI assistants. Store facts, decisions, and context with semantic search. Works with Claude Code, OpenCode, OpenClaw, and any MCP client.
version: 1.0.1
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, mcp, cli]
emoji: brain
---

# Squish Memory v1.0.1

Persistent memory system for AI coding assistants. Store facts, decisions, context, and preferences with semantic search.

## What is Squish?

Squish provides persistent memory for AI agents with:
- **Hybrid Search**: BM25 + vector embeddings with graph expansion
- **Memory Types**: observation, fact, decision, context, preference
- **Graph Associations**: Link related memories together
- **Core Memory**: Always-visible context sections
- **Importance Scoring**: Auto-score memories with temporal decay
- **Consolidation**: Summarize old, low-importance memories
- **Namespace Support**: Hierarchical organization of memories
- **Maintenance Scheduling**: Automated cleanup and optimization tasks

## Install

```bash
npm install -g squish-memory
# or
bun add -g squish-memory
```

## Quick Setup

### Interactive Wizard (Recommended)
```bash
squish
```
Launches the interactive installer menu.

### Direct Server Start
```bash
# MCP server (for Claude Code, etc.)
squish run mcp

# Web UI only
squish run web
```

### MCP Clients
Configure in your client's MCP settings:
- **Command**: `squish-mcp`
- **Args**: (none needed)
- **Environment**: 
  - `SQUISH_MODE=local` or `team`
  - `SQUISH_DATA_DIR=~/.squish`

## Skills Available

This repo contains 4 skills for different use cases:

| Skill | Description | Install |
|-------|-------------|---------|
| `squish-memory` | Overview & quick start | `npx skills add michielhdoteth/squish --skill squish-memory` |
| `squish-mcp` | MCP tools (16 tools) | `npx skills add michielhdoteth/squish --skill squish-mcp` |
| `squish-cli` | CLI commands | `npx skills add michielhdoteth/squish --skill squish-cli` |
| `memory-guide` | Usage guide & best practices | `npx skills add michielhdoteth/squish --skill memory-guide` |

## MCP Tools (16)

- squish_remember - Store memory
- squish_search - Hybrid search
- squish_recall - Get by ID
- squish_forget - Delete memory
- squish_update - Update memory
- squish_associate - Link memories
- squish_related - Find related
- squish_context - Project context
- squish_observe - Record observation
- squish_qmd_search - Search docs
- squish_embed - Generate embeddings
- squish_health - Check status
- squish_stats - View stats
- squish_projects - List projects

## CLI Commands

- `squish` - Interactive wizard/menu
- `squish run mcp` - Start MCP server
- `squish run web` - Start Web UI only
- `squish remember` - Store memory
- `squish search` - Find memories
- `squish recall` - Get by ID
- `squish health` - Check service status
- `squish stats` - View memory statistics
- `squish core_memory` - Manage always-visible context
- `squish add` - Interactive installer (alias)
- `squish rm` - Remove memory

## Configuration

| Env Variable | Description | Default |
|--------------|-------------|---------|
| SQUISH_MODE | local or team | local |
| SQUISH_DATA_DIR | Data directory | ~/.squish |
| SQUISH_EMBEDDINGS_PROVIDER | local or openai | local |
| SQUISH_QMD_ENABLED | Enable QMD search | true |

## More Info

- GitHub: https://github.com/michielhdoteth/squish
- npm: https://www.npmjs.com/package/squish-memory
- Docs: https://github.com/michielhdoteth/squish/tree/main/docs