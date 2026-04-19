# Squish Install Quickstart

Launch-ready install and verification paths for the current release.

## 1) Install

Recommended:

```bash
npx add-mcp squish-memory
```

Or traditional package install:

```bash
bun add squish-memory
```

## 2) Verify The MCP Server

```bash
squish-mcp --health
```

Expected output:

```text
Squish MCP Server v1.2.0
Health check: OK
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
Squish MCP Server v1.2.0
Health check: OK
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
