# Production Safety and Secret Hardening

## Required checks before launch

- Never commit API keys, tokens, or credentials.
- Ensure `SQUISH_REMOTE_TOKEN` is set for token-first remote auth flows.
- Ensure `DATABASE_URL` and `REDIS_URL` are set in remote mode.
- Verify `node scripts/verify-mcp.mjs` passes.
- Verify installer/bootstrap dry-runs pass for all target clients.

## Forbidden defaults

- No hardcoded secrets in `openclaw.json`, `.env`, scripts, or docs.
- No unrestricted CLI fallback operations outside policy allowlist.
- No legacy profile output directories in `generated/mcp/`.

## Startup warnings policy

- Missing remote token in remote mode should trigger warning and non-zero exit for auth-required workflows.
- Missing `DATABASE_URL` in remote mode should trigger warning and non-zero exit.

## Secret rotation checklist

- Rotate tokens if exposed in logs/chat/screenshots.
- Rotate `GITHUB_PERSONAL_ACCESS_TOKEN` and provider API keys after incident.
- Rotate OpenClaw gateway tokens and bot tokens if exposed.

## Validation commands

```bash
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
node scripts/install-mcp.mjs --client claude-code --dry-run
node scripts/openclaw-bootstrap.mjs --dry-run --skip-tool-check
node scripts/squish-fallback.mjs --op health --simulate-mcp-failure --dry-run
```
