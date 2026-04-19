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
bun run verify:mcp
```

Expected output:

```text
[MCP] Health check passed. Server initialized with ... tools.
```

## 3) Start Specific Surfaces

### MCP server

```bash
squish run mcp
```

### Web UI

```bash
squish run web
# Then visit http://localhost:37777
```

## 4) Sanity-Check The Runtime

```bash
squish health
squish context
squish stats
```

If you want to inspect why a specific record exists:

```bash
squish inspect <memory-id>
```

## Expected Outputs

### squish run mcp

```text
[squish-memory] v1.2.0 initializing...
[MCP] Connected via stdio. ... tools available.
```

### squish run web

```text
[squish] Starting Web UI only...
[squish:info] Web UI available at http://localhost:37777
```

### squish health

```text
Status: ok|degraded|broken
Current project: ...
Subsystems
...
Next step: ...
```
