# Squish - Production-Ready Memory for AI Agents

## Overview

Squish is a **production-ready, enterprise-grade memory system** for AI agents with comprehensive MCP tool support and dual storage modes. MIT licensed - free for commercial use.

## Features

### CLI Commands
- `squish remember "memory"` - Store memories with trigger detection
- `squish search "query"` - Hybrid search (BM25 + vectors)
- `squish core_memory` - Manage always-visible context
- `squish health` - Check system status
- `squish stats` - View memory statistics

### MCP Tools (14 tools)
- squish_remember - Store memories with semantic embeddings
- squish_search - Full-text + semantic search  
- squish_recall - Get memory by ID
- squish_forget - Delete a memory
- squish_update - Update existing memory
- squish_qmd_search - Markdown file search
- squish_associate - Create memory associations
- squish_related - Find related memories
- squish_context - Get project context
- squish_observe - Store observations
- squish_embed - Generate embeddings
- squish_health - Service status
- squish_stats - Memory statistics
- squish_projects - List projects

### Two-Tier Memory Architecture
- **Fast Search Tier**: SQLite with FTS5 + vectors
- **Persistent Storage**: SQLite (local) or PostgreSQL (team)
- **Core Memory**: 2KB always-visible context (unique feature)

### Memory Intelligence
- **Trigger Detection**: Auto-detects "remember", "important", corrections
- **Contradiction Resolution**: Auto-updates when facts change
- **Temporal Facts**: Handles time-bound information
- **Confidence Scoring**: Knows reliability of each memory

## Quick Start

```bash
# Install
git clone https://github.com/michielhdoteth/squish.git
cd squish
bun install
bun run build

# Run MCP server
bun run mcp

# Or use CLI
bun ./dist/index.js remember "Remember this"
bun ./dist/index.js search "this"
```

## Environment

```bash
# Copy and customize
cp .env.mcp.example .env

# Key settings
SQUISH_EMBEDDINGS_PROVIDER=local|openai|ollama|google-multimodal|hybrid
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=true  # for google-multimodal
SQUISH_QMD_ENABLED=true|false

# Core memory limits (default: 16KB total, 4KB per section)
SQUISH_CORE_MEMORY_TOTAL_BYTES=16384
SQUISH_CORE_MEMORY_SECTION_BYTES=4096

# Embedding reliability (default: 30s timeout, 3 retries)
SQUISH_EMBEDDINGS_TIMEOUT_MS=30000
SQUISH_EMBEDDINGS_MAX_RETRIES=3
```

## License

MIT - Free for commercial use

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup and contribution guidelines.

## Resources

- [GitHub](https://github.com/michielhdoteth/squish)
- [MCP Specification](https://modelcontextprotocol.io)
- [Drizzle ORM](https://orm.drizzle.team)

---

**Built for AI Agents • MIT Licensed • Production Ready**
