# Squish Architecture

## System Overview

Squish is a **local-first memory system** for Claude Code implemented as an MCP (Model Context Protocol) server. It provides semantic search, full-text search, and contextual awareness.

```
Claude Code
    ↓
MCP Protocol (stdio)
    ↓
Squish Server (index.ts)
    ├─ MCP Handler (8 tools)
    ├─ Services Layer (15+ services)
    ├─ Database Layer (Drizzle ORM)
    └─ Storage (SQLite or PostgreSQL)
```

## Mono-Repo Structure

The repository is organized as a Bun workspace:

```
squish/
├── packages/
│   ├── server/              # Core MCP server
│   │   ├── src/
│   │   │   ├── index.ts            # Main MCP entry point
│   │   │   ├── config.ts           # Configuration management
│   │   │   ├── web.ts             # Web UI server
│   │   │   ├── db/                # Database layer
│   │   │   ├── services/          # Business logic services
│   │   │   └── plugin/            # Claude Code plugin hooks
│   │   ├── drizzle/               # Database schemas
│   │   ├── package.json           # Published on npm as "squish"
│   │   └── README.md
│   └── installer/           # Installation scripts
│       ├── get-squish.sh
│       ├── get-squish-server.js
│       ├── netlify.toml
│       └── package.json
├── infra/                   # Infrastructure
│   ├── docker-compose.yml
│   └── init.sql
├── benchmarks/              # Performance tests
├── docs/                    # Documentation
├── package.json             # Workspace root
└── bun.lockb                # Lock file
```

## Architecture Layers

### 1. MCP Server (8 Tools)

The main entry point (`packages/server/src/index.ts`) defines 8 MCP tools:

- **remember** - Store memories with embeddings
- **recall** - Get specific memory by ID
- **search** - Full-text + semantic search
- **conversations** - Search conversation history
- **recent** - Get recent memories
- **observe** - Store tool usage observations
- **context** - Retrieve project context
- **health** - Service status checks

### 2. Services Layer

Business logic is separated into focused services:

**Memory Management** (`services/memories.ts`)
- Store and retrieve memories
- Handle embeddings
- Privacy filtering

**Search** (`services/conversations.ts`)
- Search conversations
- Full-text search
- Semantic search

**Observations** (`services/observations.ts`)
- Track tool usage
- Record observations

**Embeddings** (`services/embeddings.ts`)
- OpenAI embeddings provider
- Ollama provider
- TF-IDF fallback

**Database** (`services/database.ts`)
- Query builder utilities
- Connection management

**Cache** (`services/cache.ts`)
- Redis cache layer
- Memory cache fallback

**Privacy** (`services/privacy.ts`)
- Secret detection
- Private tag filtering
- PII filtering

### 3. Database Layer

Uses **Drizzle ORM** for type-safe database access.

**SQLite Schema** (`drizzle/schema-sqlite.ts`)
- For local mode
- Uses FTS5 for full-text search
- JSON embeddings

**PostgreSQL Schema** (`drizzle/schema.ts`)
- For team mode
- Uses pgvector for semantic search
- Redis for caching

### 4. Storage Modes

**Local Mode (Default)**
- Single SQLite database
- No configuration needed
- Full-text search with FTS5
- Embeddings stored as JSON

**Team Mode**
- PostgreSQL for persistent storage
- Redis for caching
- pgvector for semantic search
- Supports concurrent access

## Plugin System

Squish integrates with Claude Code via plugin hooks:

**Hooks** (`plugin/plugin-wrapper.ts`)
- `onInstall` - Initialize on first run
- `onSessionStart` - Start auto-capture
- `onUserPromptSubmit` - Capture user input
- `onPostToolUse` - Capture tool results
- `onSessionStop` - Save state on exit

**Auto-Capture** (`plugin/capture.ts`)
- Debounced memory capture (2 seconds)
- Privacy filtering
- Observation tracking

**Context Injection** (`plugin/injection.ts`)
- Generate CLAUDE.md files
- Project context extraction

## Data Flow

### Memory Storage

```
User Input → Privacy Filter → Embeddings → Memory Record
                                              ↓
                                          Database (SQLite/PostgreSQL)
                                              ↓
                                          Index (FTS5/pgvector)
```

### Search

```
Query → Normalize → Split into:
  ├─ Full-text search (FTS5/PostgreSQL FTS)
  └─ Semantic search (Embeddings + pgvector)
                      ↓
                  Combine & Rank
                      ↓
                  Return Results
```

## Technology Stack

**Runtime**
- Node.js >=18
- Bun (for development)

**Database**
- SQLite (local) with FTS5
- PostgreSQL (team) with pgvector
- Drizzle ORM

**Search**
- FTS5 (full-text search)
- pgvector (semantic search)
- TF-IDF (local embeddings)

**APIs**
- OpenAI (embeddings)
- Ollama (local embeddings)

**Caching**
- Redis (team mode)
- In-memory (local mode)

**Web**
- Express.js
- WebSocket for real-time updates

## Performance Characteristics

- **Memory operations**: ~2.6M ops/sec
- **FTS5 queries**: ~10,000 ops/sec
- **pgvector search**: 5k-50k ops/sec
- **Web UI**: Real-time updates

## Environment Variables

```bash
# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=openai|ollama|none
SQUISH_OPENAI_API_KEY=sk-...
SQUISH_OLLAMA_URL=http://localhost:11434

# Database (team mode)
DATABASE_URL=postgres://user:pass@localhost/squish
REDIS_URL=redis://localhost:6379

# Web UI
SQUISH_WEB_PORT=37777

# Memory
SQUISH_MAX_MEMORIES=10000
SQUISH_CACHE_TTL=300
```

## Debugging

Enable debug logs:
```bash
DEBUG=squish:* node dist/src/index.js
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.
