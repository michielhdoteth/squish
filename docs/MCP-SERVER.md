# Squish MCP Server

Universal memory layer for AI agents via Model Context Protocol (MCP).

## Features

- **7 MCP Tools**: universal memory operations across recall, graph, context, inspection, multimodal ingestion, and LLM consolidation
- **Local Embeddings**: TF-IDF based, 768-dim vectors
- **QMD Integration**: Local markdown search with BM25 + vector
- **Hybrid Search**: Semantic + recency + importance scoring
- **SQLite Storage**: Free, local, no API calls
- **Multimodal Ingestion**: 27+ file types across images, audio, video, and documents
- **LLM Consolidation**: Cross-connection finding via LLM-powered knowledge analysis

## Quick Start

### STDIO Mode (Default)

```bash
# Start Squish MCP server
squish-mcp
```

### HTTP Mode

```bash
# Start with custom port
squish-mcp --http --port 9000

# Or via environment
SQUISH_MCP_MODE=http SQUISH_MCP_PORT=9000 squish-mcp
```

Server runs on `http://localhost:8767` by default.

### Endpoints (HTTP Mode)

- **Health**: `GET /health` - Server status
- **MCP**: `POST /mcp` - Streamable HTTP endpoint for MCP calls

## Tools

### 1. `squish_remember`

Store any memory or learning. Auto-detects type and routes appropriately. Supports multimodal ingestion via file path.

```json
{
  "name": "squish_remember",
  "arguments": {
    "content": "Implemented OAuth2 flow with PKCE for better security",
    "type": "decision",
    "tags": ["auth", "security"]
  }
}
```

Multimodal ingestion (image, audio, video, document):

```json
{
  "name": "squish_remember",
  "arguments": {
    "filePath": "/absolute/path/to/file.pdf",
    "description": "Architecture diagram for the auth service",
    "tags": ["architecture", "auth"]
  }
}
```

Parameters:
- `content` (optional): Text content to store as a memory. Provide either `content` or `filePath`.
- `filePath` (optional): Absolute path to a media file (image, audio, video, document) to ingest. When provided, the multimodal pipeline extracts content and creates a memory. Provide either `content` or `filePath`.
- `type` (optional): Memory type hint (auto-detected if omitted)
- `tags` (optional): Array of tags for organization
- `description` (optional): Description or context for file ingestion

Auto-detection:
- Detects learning patterns (success, failure, fix, insight)
- Detects TODO patterns
- Routes to memory, learning, or note storage automatically
- When `filePath` is provided, detects MIME type and routes to the appropriate extractor (27+ supported file types)

### 2. `squish_recall`

Recall memories by query, or retrieve a specific memory by ID.

```json
{
  "name": "squish_recall",
  "arguments": {
    "query": "authentication implementation",
    "limit": 5,
    "project": "/path/to/project"
  }
}
```

Retrieve by ID:

```json
{
  "name": "squish_recall",
  "arguments": {
    "query": "uuid-string"
  }
}
```

### 3. `squish_forget`

Delete a memory by ID, or bulk delete with search filters.

```json
{
  "name": "squish_forget",
  "arguments": {
    "memoryId": "uuid-string"
  }
}
```

Bulk delete by search:
```json
{
  "name": "squish_forget",
  "arguments": {
    "search": "old debug notes"
  }
}
```

### 4. `squish_link`

Manage memory associations: find related memories or add links between them.

```json
{
  "name": "squish_link",
  "arguments": {
    "action": "find",
    "memoryId": "uuid-string"
  }
}
```

Actions:
- `find`: Get related memories (graph traversal)
- `add`: Create association between two memories

### 5. `squish_context`

Get project context or list registered projects.

```json
{
  "name": "squish_context",
  "arguments": {
    "project": "/path/to/project",
    "limit": 10
  }
}
```

### 6. `squish_stats`

Get memory statistics, system health, and control the file watcher and consolidation engine.

```json
{
  "name": "squish_stats",
  "arguments": {
    "project": "/path/to/project",
    "action": "status"
  }
}
```

Parameters:
- `project` (optional): Project path filter
- `action` (optional, default: `"status"`): One of:
  - `"status"` -- Returns memory counts, health status, watcher state, consolidation config, embedding availability, and version info
  - `"start_watcher"` -- Starts the file watcher for multimodal ingestion from the inbox directory
  - `"stop_watcher"` -- Stops the file watcher
  - `"consolidate"` -- Runs LLM cross-connection finding between memory clusters

### 7. `squish_inspect`

Explain why a memory was retained, where it was routed, and whether raw fallback exists.

```json
{
  "name": "squish_inspect",
  "arguments": {
    "memoryId": "uuid-string"
  }
}
```

## Configuration

### Environment Variables

```bash
# MCP Server
SQUISH_MCP_PORT=8767                  # MCP server port (default: 8767)
SQUISH_MCP_MODE=stdio                 # Mode: stdio or http (default: stdio)

# Storage
SQUISH_DATA_DIR=/path/to/data          # Data directory (default: .squish/)
SQUISH_DB_TYPE=sqlite               # Database: sqlite or postgres

# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=local    # Provider: local|openai|ollama|lmstudio|transformers|google|auto
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=false  # Enable Google Multimodal

# Google Cloud Multimodal (optional)
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=xxx              # Or use service account

# QMD Integration
SQUISH_QMD_ENABLED=true             # Enable QMD search
SQUISH_QMD_COLLECTIONS=/path/to/colls # QMD collections path
SQUISH_QMD_FALLBACK=hybrid          # Fallback mode: qmd-only|cloud-first|hybrid|local-only

# Multimodal Ingestion
SQUISH_MULTIMODAL_ENABLED=true       # Enable multimodal ingestion (default: true)
SQUISH_MULTIMODAL_INBOX_DIR=./inbox  # Inbox directory for file watcher (default: ./inbox)
SQUISH_MULTIMODAL_POLL_INTERVAL_MS=5000  # File watcher poll interval in ms (default: 5000)
SQUISH_MULTIMODAL_MAX_FILE_SIZE_BYTES=104857600  # Max file size in bytes (default: 100MB)

# LLM Consolidation
SQUISH_LLM_CONSOLIDATION_ENABLED=false  # Enable LLM cross-connection finding (default: false)
SQUISH_LLM_CONSOLIDATION_BATCH_SIZE=50  # Batch size for consolidation analysis (default: 50)
SQUISH_LLM_CONSOLIDATION_MIN_AGE_DAYS=7  # Minimum memory age in days before consolidation (default: 7)
SQUISH_LLM_CONSOLIDATION_MIN_CONNECTIONS=2  # Minimum existing connections before consolidation (default: 2)
SQUISH_LLM_API_KEY=xxx                # LLM API key for consolidation (falls back to OPENAI_API_KEY)
SQUISH_LLM_PROVIDER=openai            # LLM provider: openai|anthropic|gemini (default: openai)
```

### Embedding Providers

1. **local** (default): TF-IDF based embeddings, 768-dim, no API calls
2. **openai**: Requires `SQUISH_OPENAI_API_KEY` and `SQUISH_OPENAI_EMBEDDING_MODEL`
3. **ollama**: Requires `SQUISH_OLLAMA_URL` and `SQUISH_OLLAMA_EMBEDDING_MODEL`
4. **lmstudio**: Requires `SQUISH_LM_STUDIO_URL` and `SQUISH_LM_STUDIO_EMBEDDING_MODEL`
5. **transformers**: Requires `SQUISH_LOCAL_MODEL`
6. **google**: Requires Google credentials/project and `SQUISH_GOOGLE_EMBEDDING_MODEL`
7. **auto**: Tries configured providers and falls back to local TF-IDF

## Architecture

```
┌─────────────────────────────────────────────┐
│         MCP Client (OpenCode, etc.)         │
└────────────────┬────────────────────────────┘
                 │ MCP Protocol
                 ▼
┌─────────────────────────────────────────────┐
│         Squish MCP Server (port 8767)        │
│  ┌──────────────────────────────────────┐   │
│  │  7 Tools: remember, recall, forget,  │   │
│  │  link, context, stats, inspect       │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  Embeddings: Local, QMD, Multimodal  │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  Multimodal Pipeline (27+ types)     │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  LLM Consolidation Engine            │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  Storage: SQLite / PostgreSQL        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Development

```bash
# Clone
git clone https://github.com/4m-labs/squish.git
cd squish

# Install
npm install
# or: yarn install
# or: bun install

# Run MCP server
squish-mcp

# Or in HTTP mode
squish-mcp --http

# Health check
squish-mcp --health
```

## Security Note

The following operations are NOT available via MCP:
- Setting encryption passphrase (`squish_set_passphrase`)
- Rotating encryption key (`squish_rotate_key`)

These must be done manually via the `.env` file in the data directory.

## License

MIT © 4M Labs

## Links

- [GitHub](https://github.com/4m-labs/squish)
- [QMD](https://github.com/tobi/qmd)
- [MCP Specification](https://modelcontextprotocol.io)
