# MCP Migration: Profiles to Universal

Squish now uses one universal MCP configuration and one generated artifact set.

## Breaking Change

- Old output layout: `generated/mcp/{profile}/`
- New output layout: `generated/mcp/`

## Config Migration

- Legacy `profiles` blocks in `config/mcp.json` are ignored by the universal generator.
- Keep only:
  - `version`
  - `defaults`
  - `servers`

## Compatibility Messaging

- `scripts/generate-mcp.mjs` emits migration warnings when:
  - legacy `profiles` exists in config
  - legacy profile output directories are removed

## New Commands

```bash
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
node scripts/install-mcp.mjs --client claude-code --dry-run
node scripts/openclaw-bootstrap.mjs --dry-run --skip-tool-check
```
