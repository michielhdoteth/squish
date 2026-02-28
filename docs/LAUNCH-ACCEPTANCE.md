# End-to-End Launch Acceptance

## Acceptance commands

```bash
bun run build
bun test
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
node scripts/install-mcp.mjs --client claude-code --dry-run
node scripts/install-mcp.mjs --client opencode --dry-run
node scripts/install-mcp.mjs --client codex --dry-run
node scripts/install-mcp.mjs --client openclaw --dry-run
node scripts/openclaw-bootstrap.mjs --dry-run --skip-tool-check
node scripts/squish-fallback.mjs --op search --mcp-enabled --dry-run
node scripts/squish-fallback.mjs --op search --simulate-mcp-failure --dry-run
bunx vitest run tests/mcp/universal-contract.test.ts tests/mcp/mode-semantics.test.ts tests/mcp/remote-auth-contract.test.ts tests/mcp/generate-mcp-universal.test.ts tests/mcp/install-mcp.test.ts tests/mcp/openclaw-bootstrap.test.ts tests/mcp/verify-mcp.test.ts tests/mcp/squish-fallback.test.ts
```

## Release readiness checklist

- [x] Universal generation validated
- [x] Verification and reproducibility validated
- [x] Multi-client installer dry-runs validated
- [x] OpenClaw bootstrap dry-run validated
- [x] MCP and CLI fallback path telemetry validated
- [x] MCP script tests passing
- [x] Build and unit/integration test suite passing
- [x] Memory system/governance/lifecycle docs added
- [x] Competitive positioning docs added and linked
