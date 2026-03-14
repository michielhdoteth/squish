---
name: squish-memory
description: Persistent memory system with semantic search. Store and retrieve information across sessions. Works with Claude Code, OpenCode, OpenClaw, and any MCP client.
version: 0.9.0
author: michielhdoteth
tags: [memory, persistence, search, semantic-search, ai-assistant, claude-code, openclaw, opencode, mcp]
emoji: brain
---

# Squish Memory

Persistent memory for AI assistants. Store facts, decisions, and context with semantic search.

**Works everywhere:** Claude Code, OpenCode, OpenClaw, or any MCP-compatible client.

## Quick Install

```bash
npm install -g squish-memory
```

That's it! The `squish-mcp` command is now available.

## Client Setup

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "squish": {
      "type": "local",
      "command": ["squish-mcp"],
      "enabled": true,
      "environment": {
        "SQUISH_MODE": "local"
      }
    }
  }
}
```

Or run: `npx squish-memory install opencode`

### Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": [],
      "env": {
        "SQUISH_MODE": "local"
      }
    }
  }
}
```

Or run: `npx squish-memory install claude`

### OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": [],
      "env": {
        "SQUISH_MODE": "local"
      },
      "transport": "stdio"
    }
  }
}
```

Or run: `npx squish-memory install openclaw`

## MCP Tools

- `squish_search` - Hybrid search across memories
- `squish_remember` - Store information
- `squish_recall` - Retrieve by ID
- `squish_forget` - Delete a memory
- `squish_update` - Update existing memory
- `squish_qmd_search` - Search markdown files
- `squish_associate` - Link related memories
- `squish_related` - Find related memories
- `squish_context` - Get project context
- `squish_observe` - Store observations
- `squish_embed` - Generate embeddings
- `squish_health` - Service health
- `squish_stats` - Memory statistics
- `squish_projects` - List projects

## CLI Commands (Fallback)

When MCP is not available:

```bash
squish health              - Check service health
squish remember "text"     - Store a memory
squish search "query"      - Search memories
squish recall <id>         - Get memory by ID
squish stats               - View statistics
```

## Memory Types

- **observation**: Patterns noticed, tool usage
- **fact**: Technical information, specifications
- **decision**: Choices made with reasoning
- **context**: Project/domain information
- **preference**: User likes/dislikes

## Configuration

Environment variables:
- `SQUISH_MODE` - "local" (default) or "remote"
- `SQUISH_DATA_DIR` - Custom data directory (default: `~/.squish`)
- `SQUISH_EMBEDDINGS_PROVIDER` - "local" (default) or "openai"

## Troubleshooting

```bash
# Check installation
squish-mcp --health

# Check data directory
ls ~/.squish
```

## More Information

- GitHub: https://github.com/michielhdoteth/squish
- npm: https://www.npmjs.com/package/squish-memory
