# Squish Memory for OpenClaw

OpenClaw plugin that connects to Squish memory system via MCP protocol.

## Installation

```bash
npm install @squish/memory-openclaw
```

## Configuration

In your OpenClaw config (`~/.openclaw/agents.json` or similar):

```json
{
  "plugins": {
    "enabled": true,
    "slots": {
      "memory": "squish-memory-openclaw"
    },
    "entries": {
      "squish-memory-openclaw": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8767",
          "autoStart": false,
          "sync": {
            "enabled": true,
            "interval": "5m",
            "extraPaths": ["notes", "docs/memory"]
          }
        }
      }
    }
  }
}
```

## Requirements

- Squish memory server running (either via `squish-mcp --stdio` or HTTP at `baseUrl`)
- mcporter (if using OpenClaw's MCP mode)
- qmd (for fast markdown search)

These are auto-installed by the Squish installer when you run:
```bash
npx squish-memory install-plugin --client=openclaw
```

## How It Works

1. The plugin registers in the `memory` slot of OpenClaw
2. It connects to Squish MCP server (spawns one if autoStart=true)
3. Periodic sync monitors workspace files and stores them as memories
4. Tool calls from OpenClaw:
   - `memory_search(query, maxResults)` → Squish hybrid search
   - `memory_get(uri, lineRange, overview)` → Retrieve memory content

## Development

```bash
cd packages/plugin-openclaw
npm install
npm run build
```

## License

MIT
