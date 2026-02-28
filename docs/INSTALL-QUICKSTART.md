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

## 2) Install for Claude Code

```bash
node scripts/install-mcp.mjs --client claude-code
```

Expected output:

```text
INSTALLED mcp-servers.json -> <target>/mcp-servers.json
```

## 3) Install for OpenCode

```bash
node scripts/install-mcp.mjs --client opencode
```

Expected output:

```text
INSTALLED mcp-servers.json -> <target>/mcp-servers.json
```

## 4) Install for Codex

```bash
node scripts/install-mcp.mjs --client codex
```

Expected output:

```text
INSTALLED mcp-servers.json -> <target>/mcp-servers.json
```

## 5) OpenClaw bootstrap

```bash
node scripts/openclaw-bootstrap.mjs --skip-tool-check
```

Expected output:

```text
BOOTSTRAPPED mcporter config -> <target>/mcporter.json
BOOTSTRAPPED memory config merge -> <target>/openclaw-memory.json
```

## 6) MCP primary + CLI fallback

Primary MCP path (dry run):

```bash
node scripts/squish-fallback.mjs --op search --mcp-enabled --dry-run
```

Fallback path (dry run):

```bash
node scripts/squish-fallback.mjs --op search --simulate-mcp-failure --dry-run
```

Expected output contains:

- `"executionPath":"mcp"` for primary
- `"executionPath":"cli-fallback"` for fallback
