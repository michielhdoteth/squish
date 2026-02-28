# Release Notes - Universal MCP Launch

## Highlights

- Replaced profile-based generation with one universal MCP artifact set.
- Added strict MCP verification (`scripts/verify-mcp.mjs`) with reproducibility checks.
- Added multi-client installer (`scripts/install-mcp.mjs`) for Claude Code, OpenCode, Codex, OpenClaw.
- Added OpenClaw bootstrap helper (`scripts/openclaw-bootstrap.mjs`).
- Added token-first MCP-to-CLI fallback wrapper (`scripts/squish-fallback.mjs`) with allowlist guardrails.
- Added launch CI workflow (`.github/workflows/mcp-launch-checks.yml`).

## Migration summary

- Old layout: `generated/mcp/{profile}/`
- New layout: `generated/mcp/`
- Legacy profile blocks are ignored by generator and migration warnings are emitted.

## Operator commands

```bash
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
node scripts/install-mcp.mjs --client claude-code --dry-run
node scripts/openclaw-bootstrap.mjs --dry-run --skip-tool-check
```
