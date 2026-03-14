# Squish MCP Server

Universal memory layer for AI agents via Model Context Protocol (MCP).

## Features

- **6 MCP Tools**: Search, remember, recall, embed, QMD search, health
- **Google Multimodal Embeddings**: 1408-dim vectors for text + images + video
- **QMD Integration**: Local markdown search with BM25 + vector
- **Hybrid Search**: Semantic + recency + importance scoring
- **Dual Mode**: Local (SQLite, free) or Managed (cloud, paid)

## Quick Start

### Local Mode (Default)

```bash
# Start Squish MCP server
bun run mcp

# Or with custom port
SQUISH_MCP_PORT=9000 bun run mcp
```

Server runs on `http://localhost:8767` by default.

### Endpoints

- **SSE**: `GET /sse` - Server-sent events for real-time updates
- **Initialize**: `POST /initialize` - MCP handshake
- **Tools List**: `GET /tools/list` - List available tools
- **Tool Call**: `POST /tools/call` - Execute a tool
- **Health**: `GET /health` - Server status

## Tools

### 1. `squish_search`

Search memories using hybrid scoring (semantic + recency + importance).

```json
{
  "name": "squish_search",
  "arguments": {
    "query": "authentication implementation",
    "limit": 5,
    "project": "/path/to/project"
  }
}
```

### 2. `squish_remember`

Store a new memory.

```json
{
  "name": "squish_remember",
  "arguments": {
    "content": "Implemented OAuth2 flow with PKCE",
    "type": "decision",
    "tags": ["auth", "security"],
    "project": "/path/to/project"
  }
}
```

### 3. `squish_recall`

Retrieve a specific memory by ID.

```json
{
  "name": "squish_recall",
  "arguments": {
    "memoryId": "abc123"
  }
}
```

### 4. `squish_embed`

Generate embeddings for text.

```json
{
  "name": "squish_embed",
  "arguments": {
    "text": "Sample text to embed"
  }
}
```

Returns:
```json
{
  "dimensions": 768,
  "preview": [0.123, -0.456, 0.789, ...]
}
```

### 5. `squish_qmd_search`

Search markdown files using QMD (local, fast BM25 + vector).

```json
{
  "name": "squish_qmd_search",
  "arguments": {
    "query": "agent memory architecture",
    "collection": "notes",
    "limit": 10
  }
}
```

### 6. `squish_health`

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
  "status": "ok",
  "version": "0.9.0",
  "qmd": "available",
  "timestamp": "2026-03-11T..."
}
```

## Configuration

### Environment Variables

```bash
# MCP Server
SQUISH_MCP_PORT=8767                  # MCP server port (default: 8767)
SQUISH_MCP_SERVER_ENABLED=true        # Enable MCP server (default: true)

# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=local      # Provider: local|openai|ollama|qmd|hybrid|google-multimodal
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=true  # Enable Google Multimodal

# Google Cloud Multimodal (optional)
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=xxx              # Or use service account

# QMD Integration
SQUISH_QMD_ENABLED=true               # Enable QMD search
SQUISH_QMD_COLLECTIONS=/path/to/colls # QMD collections path
SQUISH_QMD_FALLBACK=hybrid            # Fallback mode: qmd-only|cloud-first|hybrid|local-only

# Managed Mode (coming soon)
SQUISH_MANAGED_MODE=false             # Use managed cloud storage
SQUISH_MANAGED_API_URL=https://api.squish.dev
SQUISH_MANAGED_API_KEY=xxx
```

### Embedding Providers

1. **local** (default): TF-IDF based embeddings, 768-dim, no API calls
2. **openai**: OpenAI text-embedding-3-small, requires API key
3. **ollama**: Local Ollama with nomic-embed-text:v1.5
4. **qmd**: QMD-based embeddings (experimental)
5. **hybrid**: Try providers in order: Google Multimodal → QMD → Ollama → OpenAI → Local
6. **google-multimodal**: Google Vertex AI multimodalembedding@001, 1408-dim

## Google Multimodal Embeddings

The `google-multimodal` provider supports text, images, and video in the same 1408-dimensional semantic space.

### Setup

1. **Option A: API Key**
```bash
export GOOGLE_CLOUD_API_KEY="your-api-key"
export GOOGLE_CLOUD_PROJECT="your-project"
```

2. **Option B: Service Account**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GOOGLE_CLOUD_PROJECT="your-project"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

### Usage

```typescript
import { getEmbedding } from 'squish-memory';

// Text embedding (1408-dim)
const textEmbedding = await getEmbedding("Hello world");

// Multimodal embedding
const multimodalEmbedding = await getEmbedding({
  text: "Photo of a cat",
  image: imageBuffer,  // Buffer or base64 string
});

// Video embedding (requires GCS URI)
const videoEmbedding = await getEmbedding({
  text: "Tutorial video",
  video: "gs://bucket/video.mp4",
});
```

## Managed Mode (Coming Soon)

Squish will offer a managed cloud storage option for teams:

- **Local Mode**: SQLite database in `.squish/` directory (free, OSS)
- **Managed Mode**: Cloud storage via Squish API (paid, managed)

Managed mode features:
- Automatic backups
- Multi-device sync
- Team collaboration
- Enterprise support

Pricing: TBA

## Architecture

```
┌─────────────────────────────────────────────┐
│         MCP Client (OpenClaw, etc.)         │
└────────────────┬────────────────────────────┘
                 │ MCP Protocol (SSE)
                 ▼
┌─────────────────────────────────────────────┐
│          Squish MCP Server (port 8767)      │
│  ┌──────────────────────────────────────┐  │
│  │  Tools: search, remember, recall...   │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │  Embeddings: Google Multimodal, QMD  │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │  Storage: SQLite (local) or Managed  │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Contributing

We welcome contributions! This is open source under MIT license.

### Development

```bash
# Clone
git clone https://github.com/michielhdoteth/squish.git
cd squish

# Install
bun install

# Build
bun run build

# Test
bun test

# Run MCP server
bun run mcp
```

### Roadmap

- [ ] QMD auto-indexing for markdown vaults
- [ ] Managed mode implementation
- [ ] Web UI for memory management
- [ ] CLI tools for memory operations
- [ ] Embedding model fine-tuning support

## License

MIT © michielhdoteth

## Links

- [GitHub](https://github.com/michielhdoteth/squish)
- [QMD](https://github.com/tobi/qmd)
- [MCP Specification](https://modelcontextprotocol.io)
