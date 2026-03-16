# Squish - Universal Two-Tier Memory for AI Agents

**Squish gives any AI agent persistent, intelligent memory through a two-tier architecture.** Without memory, agents forget everything between sessions. With Squish, they learn, adapt, and get smarter over time - regardless of which agent framework you use.

```bash
npm install squish-memory
```

## Why Agents Need Memory

| Without Squish | With Squish |
|----------------|-------------|
| Forgets after every session | Remembers across sessions |
| Repeats the same mistakes | Learns from past decisions |
| No context awareness | Builds project understanding |
| Can't track preferences | Adapts to user style |

## How It Works

Squish uses a two-tier memory architecture for optimal performance:
- **Fast Search Tier**: QMD (Quick Markdown Search) provides lightning-fast hybrid BM25 + vector search
- **Persistent Storage Tier**: SQLite (local) or PostgreSQL (team) ensures durable, reliable memory storage

```
Agent Action -----> [Squish Memory Layer]
                            |
                            v
                     ┌──────────────┐
                     │  Trigger     │ <-- "remember this", "important"
                     │  Detection   │
                     └──────────────┘
                            |
                            v
                     ┌──────────────┐
                     │  Write Gate  │ <-- Validate, sanitize, score
                     └──────────────┘
                            |
                            v
          ┌─────────────────────┐
          │  Dual Storage Write │
          │  ──→ QMD Index      │  (fast search)
          │  ──→ SQLite/Postgres│  (durable storage)
          └─────────────────────┘
                            |
                            v
          ┌─────────────────────┐
          │  Hybrid Retrieval   │
          │  QMD Search +       │
          │  Vector Ranking     │
          └─────────────────────┘
                            |
                            v
                     Agent Context
```

## Key Features

### Memory Intelligence
- **Trigger Detection**: Auto-detects "remember", "important", corrections
- **Contradiction Resolution**: Auto-updates when facts change
- **Temporal Facts**: Handles time-bound information ("until January")
- **Confidence Scoring**: Knows how reliable each memory is

### Retrieval Quality
- **Hybrid Search**: Vector + keyword (BM25) with fusion
- **Multi-factor Ranking**: Semantic, recency, importance, confidence
- **Telemetry**: Tracks which memories are actually useful

### Agent Safety
- **Write Gate**: Validates content before storage
- **Secret Detection**: Auto-redacts API keys, passwords
- **Graceful Degradation**: Works even when database fails

## Quick Start

### For Claude Code (Plugin)
```bash
# Install from marketplace
/plugin marketplace add https://github.com/michielhdoteth/squish.git
/plugin install squish@michielhdoteth-squish
```

### For OpenClaw (npm)
```bash
npm install -g squish-memory
```

Add to your OpenClaw MCP config - done.

### Universal CLI
```bash
# Works with any agent framework
squish remember "User prefers TypeScript"
squish search "preferences"
squish health
```

### Universal API
```bash
# Start the universal HTTP server
bun run universal:server

# Add memory via HTTP (stored in both QMD index and SQLite)
curl -X POST http://localhost:3000/api/memories \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers TypeScript", "type": "preference", "container": "my-project"}'

# Search memories via HTTP (uses QMD for fast hybrid search)
curl "http://localhost:3000/api/memories/search?q=TypeScript"
```

**That's it.** One install, persistent memory for any AI agent.

## MCP Tools for Agents

| Tool | What It Does |
|------|--------------|
| `remember` | Store a memory |
| `search` | Find relevant memories |
| `recall` | Get specific memory by ID |
| `core_memory` | Always-visible context (persona, user info) |
| `context` | Get project-relevant memories |
| `observe` | Record patterns from tool usage |

## Execution Model

- **Universal First**: Works with any AI agent via MCP, CLI, or HTTP API
- **Transport Agnostic**: MCP (stdio/SSE), CLI, or HTTP/WebSocket - choose your preference
- **Storage Flexible**: SQLite for local, PostgreSQL for team deployments

## Universal API

Squish now provides a universal HTTP API that works with any AI agent:

```typescript
// Add memory via HTTP
POST /api/memories
{
  "content": "User prefers TypeScript",
  "type": "preference",
  "container": "my-project",
  "tags": ["preferences", "coding-style"]
}

// Search memories via HTTP
GET /api/memories/search?query=TypeScript&limit=10
```

**Universal Benefits:**
- Works with any AI agent (Claude, OpenAI, Anthropic, custom)
- HTTP RESTful API + WebSocket for real-time sync
- PostgreSQL + pgvector for scalable memory
- Docker-ready for easy deployment

### Docker Deployment

```bash
# Quick start with Docker Compose
docker-compose -f docker-compose.universal.yml up

# Or deploy to cloud
docker build -t squish-universal .
docker run -p 3000:3000 squish-universal
```

## Open-Core Model

- **OSS Core (MIT)**: local mode, self-hosted workflows, MCP/CLI tooling
- **Commercial Remote**: managed remote control plane, enterprise ops, support
- **Universal API**: HTTP REST + WebSocket for any AI agent
- **Sponsor development**: https://github.com/sponsors/michielhdoteth

## Configuration

### Environment Variables

**Required (local mode - default):**
- None! Works out-of-the-box with local TF-IDF embeddings

**Universal API:**
```bash
# For universal HTTP API mode
DATABASE_URL=postgresql://user:pass@host/db  # Required for universal mode
REDIS_URL=redis://localhost:6379             # Optional for caching
PORT=3000                                   # API server port
```

**Optional:**
```bash
SQUISH_DATA_DIR=./.squish          # Custom data directory
SQUISH_EMBEDDINGS_PROVIDER=local   # local, openai, ollama, google-multimodal, hybrid

# For better embeddings (optional)
SQUISH_OPENAI_API_KEY=sk-...
SQUISH_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SQUISH_OLLAMA_URL=http://localhost:11434
SQUISH_OLLAMA_EMBEDDING_MODEL=nomic-embed-text:v1.5
SQUISH_GOOGLE_CLOUD_PROJECT=your-project
SQUISH_GOOGLE_CLOUD_API_KEY=your-key

# Embedding performance & reliability
SQUISH_EMBEDDINGS_TIMEOUT_MS=30000
SQUISH_EMBEDDINGS_MAX_RETRIES=3
SQUISH_EMBEDDINGS_RETRY_DELAY_MS=1000

# Core memory size (default: 16KB total, 4KB per section)
SQUISH_CORE_MEMORY_TOTAL_BYTES=16384
SQUISH_CORE_MEMORY_SECTION_BYTES=4096

# For team mode
DATABASE_URL=postgresql://user:pass@host/db
```

## Architecture

### Two-Tier Memory System
Squish employs a two-tier architecture for optimal performance and reliability:
- **Fast Search Tier**: QMD (Quick Markdown Search) provides hybrid BM25 + vector search with sub-second response times
- **Persistent Storage Tier**: SQLite (local mode) or PostgreSQL (team mode) ensures durable, ACID-compliant memory storage

### Universal Interfaces
- **MCP Server**: Native integration for Claude Code, OpenClaw, and any MCP-compatible agent
- **HTTP REST API**: Universal JSON API works with any AI agent capable of HTTP requests
- **WebSocket**: Real-time memory sync and notifications for collaborative agents
- **CLI**: Standalone command-line tool for shell-based agents and debugging

### Memory Organization
- **Core Memory (configurable, default 16KB total)**: Always-visible sections for persona, user info, project context, and working notes. Each section limited to 4KB by default. Token estimation helps track LLM context usage.
- **Context Paging**: Agent-controlled retrieval with token budgeting (8KB default)
- **Background Jobs**: Automatic memory maintenance including decay, deduplication, and consolidation

### Memory Lifecycle
- **Sectors**: episodic, semantic, procedural, autobiographical, working memory
- **Tiers**: hot (recently accessed), warm (accessible), cold (archived but searchable)
- **Status**: active, merged, superseded, expired (with automatic handling)

### Deployment Flexibility
- **Local SQLite**: Zero-configuration, perfect for individual agents and edge deployment
- **PostgreSQL**: Horizontal scaling for teams and enterprise deployments
- **Docker**: Single-command deployment with docker-compose.universal.yml
- **Cloud**: Ready for AWS/GCP/Azure with standard PostgreSQL compatibility

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# Verify MCP
bun run verify:mcp
```

## Troubleshooting

### Database Issues
- **SQLite corrupted**: Delete `.squish/squish.db` and restart
- **PostgreSQL connection**: Verify DATABASE_URL format

### MCP Issues
- **Hooks not working**: Run `bun run build` first
- **API prompts**: Set `SQUISH_EMBEDDINGS_PROVIDER=local`

## License

MIT for OSS core. See `LICENSE` for details.

## Links

- GitHub: https://github.com/michielhdoteth/squish
- Issues: https://github.com/michielhdoteth/squish/issues
- Sponsors: https://github.com/sponsors/michielhdoteth
