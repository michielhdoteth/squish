# Squish Architecture

## System Overview

Squish is a **hybrid memory runtime** for AI agents implemented as an MCP server with HTTP fallback. It combines automatic signal distillation, session working-set continuity, durable memory, and hybrid retrieval.

```
Any AI Agent
     ↓
MCP (stdio/Streamable HTTP) / CLI
     ↓
packages/mcp/src/index.ts
   ├─ MCP Tools (13 tools)
   ├─ Core Services
   │   ├─ Signal Engine
   │   ├─ Session Working Set
   │   └─ Raw Fallback Snapshotting
   ├─ Durable Storage
   │   ├─ QMD Search Tier (fast hybrid BM25+vector)
   │   └─ SQLite/Postgres Tier
   └─ Database Layer (Drizzle ORM)
```

## Package Structure

The repository is organized as a Bun workspace:

```
squish/
├── packages/
│   ├── mcp/                 # MCP server package
│   │   ├── src/
│   │   │   └── index.ts      # Main MCP entry point (13 tools)
│   │   └── package.json
│   └── cli/                  # CLI package
│       ├── src/
│       │   └── index.ts     # CLI entry point
│       └── package.json
├── bin/
│   ├── squish-mcp.mjs       # MCP server binary
│   └── squish.mjs           # CLI binary
├── core/                    # Core library
│   ├── memory/              # Memory management
│   ├── graph/               # Knowledge graph
│   ├── search/             # Search algorithms
│   └── ...
├─��� docs/                   # Documentation
├── package.json           # Root workspace
└── bun.lock                # Lock file
```

## Architecture Layers

### 1. MCP Server (13 Tools)

The main entry point (`packages/mcp/src/index.ts`) defines 13 MCP tools covering memory management, search, learning, context, and system operations.

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

### 3. Signal Engine

Squish does not write every captured event directly into durable memory. The ingestion path first classifies each event:

- `discard` for noise that should never survive
- `session-only` for active working context
- `durable-distilled` for long-lived signal
- `durable-raw+distilled` for signal that needs a distilled memory plus an internal raw fallback artifact

This keeps long-term memory denser while preserving reversibility for debugging-heavy events.

The same stage also emits:
- place-routing hints so durable memory lands in the right place
- graph-enrichment hints so only durable signal feeds relationship extraction
- wake-up priority so session context is compact but relevant

### 4. Durable Storage Layer

Squish implements multi-layer storage for optimal performance:

**QMD Fast Search**
- Quick Markdown Search provides hybrid BM25 + vector search
- Automatic indexing of memory files as markdown
- Sub-second search response times
- Configurable collections per memory type

**SQLite/PostgreSQL Persistent Storage**
- **Local Mode**: SQLite database with full durability
- **Team Mode**: PostgreSQL with pgvector for semantic search
- Drizzle ORM for type-safe database access
- Full-text search with FTS5 (SQLite) or pg_trgm (Postgres)

**SQLite Schema** (`db/drizzle/schema-sqlite.ts`)
- For local mode
- JSON embeddings for vector search fallback

**PostgreSQL Schema** (`db/drizzle/schema.ts`)
- For team mode
- pgvector for semantic search

### 5. Storage Modes

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
- Debounced capture (2 seconds)
- Distillation and suppression before durable writes
- Session working-set updates
- Place routing for durable memory and place cues for session-only context
- Incremental graph enrichment for durable writes
- Raw fallback snapshotting for nuance-sensitive events

**Context Injection** (`plugin/injection.ts`)
- Generate CLAUDE.md files
- Project context extraction

## Data Flow

### Memory Storage

```
User Input / Tool Output
        ↓
Signal Distillation
        ├─ discard
        ├─ session-only → context_sessions working set + active place / graph cues
        └─ durable → write gate → memory record
                                  ├─ place assignment
                                  ├─ graph enrichment
                                  ├─ optional raw fallback snapshot
                                  └─ database + search index
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
