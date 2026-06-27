# Squish MCP Server

Universal memory layer for AI agents via Model Context Protocol (MCP).

## Features

- **18 MCP Tools**: universal memory operations across recall, health, graph, recency, lifecycle, and maintenance flows
- **Local Embeddings**: TF-IDF based, 768-dim vectors
- **QMD Integration**: Local markdown search with BM25 + vector
- **Hybrid Search**: Semantic + recency + importance scoring
- **SQLite Storage**: Free, local, no API calls

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

### 1. `squish_timeline`

3-layer progressive disclosure for memory exploration.

```json
{
  "name": "squish_timeline",
  "arguments": {
    "query": "feature implementation",
    "depth": "timeline",
    "limit": 10,
    "project": "/path/to/project"
  }
}
```

Depth options:
- `index`: ~50 tokens per result (overview)
- `timeline`: ~200 tokens per result (moderate detail)
- `detail`: ~2000 tokens per result (full context)

### 2. `squish_remember`

Store a new memory or learning. Auto-detects type and routes appropriately.

```json
{
  "name": "squish_remember",
  "arguments": {
    "content": "Implemented OAuth2 flow with PKCE for better security",
    "type": "decision",
    "tags": ["auth", "security"],
    "pin": false,
    "project": "/path/to/project"
  }
}
```

Auto-detection:
- Detects learning patterns (success, failure, fix, insight)
- Detects TODO patterns
- Routes to memory, learning, or note storage automatically

### 3. `squish_recall`

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

### 4. `squish_forget`

Delete memory by ID or bulk delete with filters.

```json
{
  "name": "squish_forget",
  "arguments": {
    "memoryId": "uuid-string",
    "confirm": true
  }
}
```

Bulk delete:
```json
{
  "name": "squish_forget",
  "arguments": {
    "olderThan": "30 days",
    "confirm": true,
    "limit": 100
  }
}
```

### 5. `squish_link`

Manage memory associations for graph-based reasoning.

```json
{
  "name": "squish_link",
  "arguments": {
    "action": "find",
    "memoryId": "uuid-string",
    "depth": 2,
    "minWeight": 0.3
  }
}
```

Actions:
- `find`: Get related memories (graph traversal)
- `add`: Create association between two memories
- `list`: List all associations

### 6. `squish_context`

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

List all projects:
```json
{
  "name": "squish_context",
  "arguments": {
    "listProjects": true
  }
}
```

### 7. `squish_health`

Check Squish health status.

```json
{
  "name": "squish_health",
  "arguments": {}
}
```

Returns:
```json
{
  "ok": true,
  "version": "1.2.0",
  "qmd": "available",
  "timestamp": "2026-04-19T...",
  "severity": "ok"
}
```

### 8. `squish_stats`

Get memory statistics for a project.

```json
{
  "name": "squish_stats",
  "arguments": {
    "project": "/path/to/project"
  }
}
```

### 9. `squish_inspect`

Explain why a memory was retained, where it was routed, and whether raw fallback exists.

```json
{
  "name": "squish_inspect",
  "arguments": {
    "memoryId": "uuid-string"
  }
}
```

### 10. `squish_pin`

Pin or unpin a memory to prevent consolidation/pruning.

```json
{
  "name": "squish_pin",
  "arguments": {
    "memoryId": "uuid-string",
    "pinned": true
  }
}
```

### 11. `squish_recent`

Get recent memories by period.

```json
{
  "name": "squish_recent",
  "arguments": {
    "period": "7days",
    "limit": 10,
    "project": "/path/to/project"
  }
}
```

Period options: `today`, `yesterday`, `thisweek`, `7days`, `14days`, `30days`, `90days`

### 12. `squish_stale`

Show stale memories (old, low-confidence, or rarely accessed).

```json
{
  "name": "squish_stale",
  "arguments": {
    "days": 30,
    "limit": 20,
    "project": "/path/to/project"
  }
}
```

### 13. `squish_list_pinned`

List all pinned memories (pinned memories are always preserved).

```json
{
  "name": "squish_list_pinned",
  "arguments": {
    "project": "/path/to/project"
  }
}
```

### 14. `squish_on_session_start`

Trigger session start - injects context from previous sessions, initializes session tracking.

```json
{
  "name": "squish_on_session_start",
  "arguments": {
    "projectPath": "/path/to/project",
    "mode": "startup"
  }
}
```

Mode options: `startup`, `resume`, `compact`

### 15. `squish_on_tool_use`

Capture a tool use event for memory - stores observation about tool execution.

```json
{
  "name": "squish_on_tool_use",
  "arguments": {
    "toolName": "write",
    "toolInput": { "filePath": "src/index.ts" },
    "toolResult": { "success": true },
    "projectPath": "/path/to/project"
  }
}
```

### 16. `squish_on_session_end`

Trigger session end - performs cleanup and signals session completion.

```json
{
  "name": "squish_on_session_end",
  "arguments": {
    "projectPath": "/path/to/project"
  }
}
```

### 17. `squish_strategy`

Manage actionable strategies. Actions: read (before task), write (after task), list, search, supersede, stats.

```json
{
  "name": "squish_strategy",
  "arguments": {
    "action": "read",
    "tags": ["architecture"],
    "type": "procedure",
    "limit": 10
  }
}
```

Actions:
- `read`: Get strategies before starting a task
- `write`: Store a strategy after completing a task
- `list`: List strategies with optional filters
- `search`: Search strategies by query
- `supersede`: Mark a strategy as superseded by another
- `stats`: Get strategy statistics

### 18. `squish_consolidate`

Run background consolidation - dedup, summarize, invalidate stale memories.

```json
{
  "name": "squish_consolidate",
  "arguments": {
    "enabled": true,
    "deduplicationThreshold": 0.92,
    "stalenessDays": 90,
    "maxConsolidationsPerRun": 50
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
┌───────────────────────────────────��─────────┐
│         Squish MCP Server (port 8767)        │
│  ┌──────────────────────────────────────┐ │
│  │  18 Tools: remember, recall, timeline, forget,    │ │
│  │  link, context, health, stats, inspect, pin,      │ │
│  │  recent, stale, list_pinned, on_session_start,    │ │
│  │  on_tool_use, on_session_end, strategy,           │ │
│  │  consolidate                                      │ │
│  └──────────────────────────────────────┘ │
│  ┌──────────────────────────────────────┐ │
│  │  Embeddings: Local, QMD, Multimodal  │ │
│  └──────────────────────────────────────┘ │
│  ┌──────────────────────────────────────┐ │
│  │  Storage: SQLite / PostgreSQL       │ │
│  └──────────────────────────────────────┘ │
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
