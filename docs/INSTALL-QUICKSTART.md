# Squish Install Quickstart

Launch-ready install paths with expected outputs.

## 1) Generate + verify artifacts

```bash
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
```

Expected output:

```text
Generated universal MCP artifacts in .../generated/mcp
MCP verification passed
```

## 2) Interactive Installation (Recommended)

```bash
squish
```

This launches the interactive wizard. Select option [5] to open the installer wizard, then follow the prompts.

## 3) Manual Installation for Specific Clients

### Claude Code
```bash
squish run mcp
# Then configure Claude Code to use the MCP server
```

### OpenCode
```bash
squish run mcp
# Then configure OpenCode to use the MCP server
```

### Codex
```bash
squish run mcp
# Then configure Codex to use the MCP server
```

### Cursor
```bash
squish run mcp
# Then configure Cursor to use the MCP server
```

### VS Code
```bash
squish run mcp
# Then configure VS Code to use the MCP server
```

### Windsurf
```bash
squish run mcp
# Then configure Windsurf to use the MCP server
```

### OpenClaw (standalone)
```bash
squish install
# Follow OpenClaw-specific prompts
```

## 4) CLI Usage (for agents and scripting)

```bash
# Store a memory
squish remember "User prefers TypeScript" --type preference

# Search memories
squish search "database schema" --limit 10

# Check health
squish health

# View stats
squish stats
```

## 5) Web UI Access

```bash
squish run web
# Then visit http://localhost:37777
```

## Expected outputs for manual installation

### squish install
```
INSTALLED mcporter config -> <target>/mcporter.json
BOOTSTRAPPED memory config merge -> <target>/openclaw-memory.json
```

### squish run mcp
```
[squish:info] v1.0.1
[squish:info] Web UI available at http://localhost:37777
```

### squish run web
```
[squish] Starting Web UI only...
[squish:info] Web UI available at http://localhost:37777
```