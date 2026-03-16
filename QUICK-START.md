# Squish - Quick Start

Universal two-tier memory for any AI agent.

## Start in 30 seconds

```bash
# 1. Install
bun install

# 2. Build
bun run build

# 3. Start MCP server (works with Claude Code, OpenClaw, or any MCP client)
bun run mcp

# ✓ Running on http://localhost:8767
```

## Test it

```bash
# Health check
curl http://localhost:8767/health

# Expected output:
{
  "status": "ok",
  "server": "squish-mcp",
   "version": "0.9.2",
  "tools": 6
}
```

## Use it

```bash
# Search memories
curl -X POST http://localhost:8767/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "squish_search",
    "arguments": {
      "query": "authentication"
    }
  }'
```

## Configure

Copy `.env.mcp.example` to `.env` and customize:

```bash
cp .env.mcp.example .env
```

Key settings:

- **SQUISH_MCP_PORT**: Server port (default: 8767)
- **SQUISH_MCP_SERVER_ENABLED**: Enable/disable MCP server (default: true)
- **SQUISH_EMBEDDINGS_PROVIDER**: local|openai|ollama|google-multimodal|hybrid (default: local)
- **SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED**: Enable Google multimodal (default: false)
- **SQUISH_QMD_ENABLED**: Enable markdown search (true/false)
- **SQUISH_CORE_MEMORY_TOTAL_BYTES**: Total core memory limit in bytes (default: 16384)
- **SQUISH_CORE_MEMORY_SECTION_BYTES**: Per-section limit in bytes (default: 4096)
- **SQUISH_EMBEDDINGS_TIMEOUT_MS**: Timeout for embedding API calls (default: 30000)
- **SQUISH_EMBEDDINGS_MAX_RETRIES**: Max retries for failed embedding calls (default: 3)

## Full Docs

See [docs/MCP-SERVER.md](docs/MCP-SERVER.md)
