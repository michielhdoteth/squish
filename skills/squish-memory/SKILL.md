---
name: squish-memory
description: Persistent memory system with semantic search. Store and retrieve information across sessions. Works with Claude Code (MCP) and OpenClaw (CLI).
version: 0.9.0
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, openclaw, mcp]
emoji: brain
---

# Squish Memory

Persistent memory for AI assistants. Store facts, decisions, and context with semantic search.

**Dual-mode:** MCP-first universal integration, CLI fallback for OpenClaw/bash workflows.

## Self-Install (OpenClaw)

One-command install for OpenClaw:

```bash
npx squish-memory install
```

This will:
1. Detect your OpenClaw directory (`~/.openclaw/` or `OPENCLAW_HOME`)
2. Install Squish CLI globally (if not present)
3. Configure MCP via mcporter in `~/.openclaw/mcporter.json`
4. Create `.squish` data directory for local storage
5. Run health check to verify installation

**Manual CLI Install:**
```bash
npm install -g squish-memory
# or
bun add -g squish-memory
```

## MCP Mode (Recommended)

Use MCP tools directly in supported clients:
- `remember` - Store information
- `search` - Find memories
- `recall` - Retrieve by ID
- `observe` - Store observations
- `context` - Get project context
- `health` - Service health
- `core_memory` - Manage always-visible context
- `forget` - Delete a memory
- `update` - Update existing memory
- `list` - List all memories
- `stats` - Memory statistics
- `consolidate` - Merge similar memories
- `export` - Export memories
- `import` - Import memories

## OpenClaw CLI Fallback

Execute via bash when MCP is not available:

### Health Check
```bash
squish health
```

### Remember
```bash
squish remember "content to remember" --type fact
squish remember "User prefers dark mode" --type preference
```

### Search
```bash
squish search "query terms" --limit 10
squish search "user preferences" --type preference
```

### Recall
```bash
squish recall <memory-id>
```

### Core Memory
```bash
squish core_memory view
squish core_memory edit --section persona --content "text"
squish core_memory append --section user_info --text "more text"
```

### Stats
```bash
squish stats
```

## Memory Types
- **fact**: Technical information, specifications
- **decision**: Choices made with reasoning
- **preference**: User likes/dislikes
- **observation**: Patterns noticed
- **context**: Project/domain information
- **note**: General notes

## Configuration

Squish runs in **local mode** by default using SQLite. No external database required.

Environment variables (optional):
- `SQUISH_MODE` - "local" (default) or "remote"
- `SQUISH_DATA_DIR` - Custom data directory (default: `~/.squish`)
- `SQUISH_EMBEDDINGS_PROVIDER` - "local" (default) or "openai"

## Troubleshooting

```bash
# Check installation
squish health

# Verify MCP config
cat ~/.openclaw/mcporter.json

# Check data directory
ls ~/.squish
```

## More Information

- GitHub: https://github.com/michielhdoteth/squish
- npm: https://www.npmjs.com/package/squish-memory
