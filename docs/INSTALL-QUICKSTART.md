# Squish Install Quickstart

Launch-ready install and verification paths for the current release.

Squish is free to run locally. Squish Cloud is the paid managed tier when you want sync, dashboard, and team features.

## 1) Install

Recommended:

```bash
npm install -g squish-memory
squish install --all
```

Or traditional package install only (MCP config manual):

```bash
npm install -g squish-memory
yarn global add squish-memory
bun add -g squish-memory
```

## 2) Verify The MCP Server

```bash
squish-mcp --health
```

Expected output:

```text
[MCP] Running health check...
[MCP] Health check passed. Server initialized with 16 tools.
```

## 3) Start Specific Surfaces

### MCP server

```bash
squish-mcp
```

### Web UI

```bash
squish run web
# Then visit http://localhost:37777
```

## 4) Sanity-Check The Runtime

```bash
squish context --json
squish health --json
squish stats --json
squish status --pretty
```

If you want to inspect why a specific record exists:

```bash
squish inspect <memory-id> --json
```

If you are upgrading an older local install and hit schema drift:

```bash
squish doctor --json --migrate
```

## Expected Outputs

### squish-mcp --health

```text
[MCP] Running health check...
[MCP] Health check passed. Server initialized with 16 tools.
```

### squish run web

```text
Starting Squish web UI on http://localhost:37777...
```

### squish context --json

```json
{
  "ok": true
}
```
