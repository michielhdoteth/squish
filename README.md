# Squish Memory Server - Mono-Repo

Production-ready local-first persistent memory for Claude Code with auto-capture, folder context, privacy filtering, and optional team mode.

## Quick Start

### Installation

```bash
# Using npm
npm install -g squish
squish

# Using curl (macOS/Linux)
curl -fsSL https://get.squishapp.dev | bash

# Using bun (for development)
bun install
bun run dev:server
```

### Configure Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "squish": {
      "command": "node",
      "args": ["/path/to/squish/packages/server/dist/src/index.js"]
    }
  }
}
```

## Repository Structure

This is a **mono-repo** containing:

- **`packages/server/`** - MCP memory server with full-text search and semantic embeddings
- **`packages/installer/`** - Installation scripts and distribution assets
- **`infra/`** - Docker Compose configuration for team mode (PostgreSQL + Redis)
- **`benchmarks/`** - Performance testing suite
- **`docs/`** - Complete documentation

## Features

### ✅ Fully Implemented MCP Tools
- `remember` - Store memories with semantic embeddings
- `recall` - Get memory by ID
- `search` - Full-text + semantic search
- `conversations` - Search past conversations
- `observe` - Store tool usage observations
- `context` - Get project context
- `health` - Service status checks

### ✅ Dual Storage Modes
- **Local Mode**: SQLite with FTS5 + JSON embeddings (zero config)
- **Team Mode**: PostgreSQL with pgvector + Redis cache (enterprise-ready)

### ✅ Pluggable Embeddings
- OpenAI API (`text-embedding-3-small`)
- Ollama local models
- Graceful fallback when disabled

## Development

```bash
# Install dependencies (all packages)
bun install

# Build all packages
bun run build

# Develop server (with hot reload)
bun run dev:server

# Run tests
bun run test

# Start Docker services (team mode)
bun run docker:up

# Clean all builds
bun run clean
```

## Configuration

### Environment Variables

```bash
# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=openai|ollama|none
SQUISH_OPENAI_API_KEY=...
SQUISH_OLLAMA_URL=http://localhost:11434

# Team mode
DATABASE_URL=postgres://user:pass@localhost/squish
REDIS_URL=redis://localhost:6379

# Web UI
SQUISH_WEB_PORT=37777
```

### Local Mode (Default)
```bash
node packages/server/dist/src/index.js
```

### Team Mode (Docker)
```bash
docker compose -f infra/docker-compose.yml up -d
DATABASE_URL=postgres://... REDIS_URL=redis://... node packages/server/dist/src/index.js
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
