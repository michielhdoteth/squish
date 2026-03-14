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
  "version": "0.9.0",
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

Copy `.env.mcp` to `.env` and customize:

```bash
cp .env.mcp .env
```

Key settings:

- **SQUISH_MCP_PORT**: Server port (default: 8767)
- **SQUISH_EMBEDDINGS_PROVIDER**: local|google-multimodal|hybrid
- **SQUISH_QMD_ENABLED**: Enable markdown search (true/false)

## Full Docs

See [docs/MCP-SERVER.md](docs/MCP-SERVER.md)
