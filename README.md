# Squish - Memory Plugin for Claude Code

Local-first persistent memory for Claude Code with auto-capture, folder context, privacy filtering, and optional team mode. Remembers conversations, tools used, decisions made, and project insights across sessions.

## Installation

### Using Claude Code Plugin Marketplace

The easiest way to use Squish is through the Claude Code plugin marketplace:

```
/plugin marketplace add squish-memory
/plugin install squish@squish-memory
```

Or manually install from GitHub:

```
/plugin install squish@https://github.com/michielhdoteth/squish
```

### Quick Install with npx

The fastest way to install Squish:

```bash
npx squish-install
```

This will download and install Squish automatically, then configure Claude Code.

### Manual Installation

```bash
# Using npm
npm install -g squish

# Using curl (macOS/Linux)
curl -fsSL https://get.squishapp.dev | bash

# For development with Bun
git clone https://github.com/michielhdoteth/squish.git
cd squish
bun install
bun run build
node dist/index.js
```

## Repository Structure

- **`features/`** - Feature modules
  - `memory/` - Memory storage and retrieval
  - `search/` - Conversation search and entity extraction
  - `plugin/` - Claude Code plugin hooks (auto-capture, context injection)
  - `web/` - Web UI for memory visualization (port 37777)
- **`core/`** - Shared services and utilities
- **`db/`** - Database layer (SQLite local, PostgreSQL team)
- **`drizzle/`** - Database schemas
- **`docs/`** - Complete documentation
- **`infra/`** - Docker Compose for team mode (PostgreSQL + Redis)

## Features

### Auto-Capture System
- **User Input**: Automatically captures all your prompts
- **Tool Usage**: Records every tool Claude Code uses (files read, written, executed)
- **Observations**: Tracks patterns, errors, decisions, and insights
- **Context Injection**: Automatically injects relevant memories into new sessions
- **Privacy Filtering**: Detects and filters secrets, API keys, and sensitive data

### Memory Tools
- `remember` - Store memories with semantic embeddings
- `recall` - Get memory by ID
- `search` - Full-text + semantic search across all memories
- `conversations` - Search past conversations
- `observe` - Store observations from tool usage
- `context` - Get project context with memories and observations
- `health` - Service status checks

### Storage Modes
- **Local Mode**: SQLite with FTS5 full-text search (zero config, everything local)
- **Team Mode**: PostgreSQL with pgvector semantic search + Redis cache (multi-user, collaborative)

### Web UI
- Real-time memory and observation browser at http://localhost:37777
- Live counts and status monitoring
- Visual search interface

### Pluggable Embeddings
- **OpenAI API** (`text-embedding-3-small`) - Best quality, requires API key
- **Ollama** - Run local models privately
- **TF-IDF** - Simple fallback when embeddings disabled

## Quick Configuration

### Default Setup (Local Mode)
Works out of the box with SQLite. No configuration needed:

```bash
bun run build
node dist/index.js
```

### Team Mode (Multi-user with PostgreSQL)
```bash
# Start PostgreSQL and Redis
bun run docker:up

# Configure database
export DATABASE_URL=postgres://user:password@localhost/squish
export REDIS_URL=redis://localhost:6379

# Run server
node dist/index.js
```

### Environment Variables

```bash
# Storage mode
DATABASE_URL=postgres://user:pass@localhost/squish  # Optional - defaults to SQLite
REDIS_URL=redis://localhost:6379                   # Optional - use for team mode

# Embeddings (optional - improves semantic search)
SQUISH_EMBEDDINGS_PROVIDER=openai|ollama|none      # Default: none
SQUISH_OPENAI_API_KEY=sk-...                       # If using OpenAI
SQUISH_OLLAMA_URL=http://localhost:11434           # If using Ollama

# Web UI
SQUISH_WEB_PORT=37777                              # Default: 37777

# Privacy & Filtering
SQUISH_PRIVACY_MODE=strict|moderate|off            # Default: moderate
```

## Development

```bash
# Install dependencies
bun install

# Build project
bun run build

# Development with watch
bun run dev

# Type checking
bun run typecheck

# Clean builds
bun run clean

# Start Docker services (team mode)
bun run docker:up
```

## Documentation

- [Server Documentation](./docs/README.md) - Detailed user guide
- [Architecture](./docs/ARCHITECTURE.md) - System design and internals
- [Deployment](./docs/DEPLOYMENT.md) - Deploying installer and server
- [Release Notes](./docs/RELEASE_NOTES.md) - Version history
- [Contributing](./docs/CONTRIBUTING.md) - Development guidelines

## Performance

- **Memory operations**: 2.6M ops/sec
- **Database**: 10,000+ ops/sec with FTS5
- **Team mode**: 5k-50k ops/sec with pgvector
- **Web UI**: Real-time at http://localhost:37777

## Web UI

Access the real-time web UI at `http://localhost:37777` with:
- Live memory and observation counts
- Real-time data refresh
- Search interface
- Status monitoring

## License

MIT - See LICENSE file for details

## Author

michielhdoteth

---

For more information, visit [github.com/michielhdoteth/squish](https://github.com/michielhdoteth/squish)
