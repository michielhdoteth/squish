# Release Checklist

## Package and metadata

- [ ] Confirm `package.json` version and changelog are correct.
- [ ] Confirm sponsor links and funding metadata are present.
- [ ] Confirm README reflects open-core + commercial remote model.

## Remote readiness

- [ ] `node scripts/remote-preflight.mjs` passes in remote env.
- [ ] `node scripts/generate-mcp.mjs` and `node scripts/verify-mcp.mjs` pass.
- [ ] Install dry-runs pass for all clients.
- [ ] Fallback telemetry path validated (`executionPath: mcp|cli-fallback`).

## npm transition

- [ ] Deprecate legacy versions (if needed):

```bash
npm deprecate "squish-memory@<0.9.0" "Deprecated: migrated to universal MCP launch model. See https://squishplugin.dev"
```

- [ ] Verify dist-tag points to release:

```bash
npm dist-tag add squish-memory@0.8.2 latest
```

## Publish

- [ ] `bun run build`
- [ ] `bun test`
- [ ] `bun run verify:mcp`
- [ ] MCP/launch tests pass
- [ ] `npm publish`

## Post-publish

- [ ] `npm view squish-memory version description homepage license`
- [ ] Verify GitHub repo homepage and docs links
- [ ] Monitor first 24h install + verification failures

## Documentation and positioning

- [ ] `docs/MEMORY-SYSTEM.md` reviewed and aligned with product behavior.
- [ ] `docs/MEMORY-GOVERNANCE.md` reviewed and aligned with merge/write policies.
- [ ] `docs/MEMORY-LIFECYCLE.md` reviewed and aligned with decay/dedup behavior.
- [ ] `docs/COMPETITIVE-ANALYSIS.md`, `docs/POSITIONING.md`, `docs/ROADMAP.md` linked from README.
