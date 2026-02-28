# MCP Upgrade Plan (OpenClaw + Multi-CLI)

## What we have now

- Canonical MCP profile config at `config/mcp.json`.
- Profile artifact generator at `scripts/generate-mcp.mjs`.
- Generated profile outputs at `generated/mcp/` for:
  - `openclaw`
  - `nanoclaw`
  - `picoclaw`
  - `claude-code`
  - `codex`
  - `opencode`
  - `default`
- OpenClaw bridge endpoint already exists at `api/openclaw/gateway.ts`.

## Verified external facts we should align with

- OpenClaw references mcporter in production code paths and config types (examples from `openclaw/openclaw`):
  - `src/config/types.memory.ts` (`memory.qmd.mcporter` config)
  - `src/memory/backend-config.ts` (`ResolvedQmdMcporterConfig`)
  - `src/memory/qmd-manager.ts` (mcporter command handling)
  - `skills/mcporter/SKILL.md` (official mcporter skill)
- mcporter supports import-based config compatibility for multiple clients and MCP server declarations under `mcpServers`.

## Gaps in current repo

- No dedicated adapters yet for Codex/OpenCode/OpenClaw; only `adapters/claude-code/` exists.
- No auto-sync path from generated profile artifacts into client-specific config locations.
- No runtime validation command that checks every generated profile for schema completeness.
- No OpenClaw-specific bootstrap helper to wire `mcporter` + `memory.qmd.mcporter` end-to-end.

## Upgrade plan

### Phase 1: Config and generation hardening

1. Keep `config/mcp.json` as single source of truth.
2. Extend `scripts/generate-mcp.mjs` with strict validation:
   - reject duplicate profile names
   - reject empty `includeServers`
   - reject unresolved `${ENV}` placeholders when `--strict-env` is enabled
3. Emit a machine-readable manifest:
   - `generated/mcp/manifest.json`
   - includes profile names, generated files, checksum, generation timestamp

### Phase 2: Client-specific installers

Add `scripts/install-mcp-profile.mjs` that copies selected generated files to target client locations.

Targets:

- Claude Code: install `mcp-servers.json` style payload
- OpenCode: install `mcp-servers.json` style payload
- Codex: install `mcp-servers.json` style payload
- OpenClaw: install
  - `mcporter.json` (runtime config)
  - `openclaw-memory-qmd.json` snippet (for memory backend config merge)

### Phase 3: OpenClaw optimization path

1. Add `scripts/openclaw-bootstrap.mjs`:
   - verifies `mcporter` is available
   - verifies `qmd` is available
   - generates OpenClaw profile artifacts
   - writes/merges OpenClaw memory snippet safely
2. Add environment preset templates:
   - `.env.openclaw.example`
   - `.env.nanoclaw.example`
   - `.env.picoclaw.example`
3. Add profile tuning guidance:
   - OpenClaw: higher concurrency, larger response limits
   - NanoClaw: lower memory footprint defaults
   - PicoClaw: strict single-call concurrency and smaller payload limits

### Phase 4: Verification and CI

1. Add profile verification script:
   - `scripts/verify-mcp-profiles.mjs`
   - checks all generated JSON parses and required fields exist
2. Add regression checks for generation reproducibility.
3. Add docs command examples for each profile and client.

## Implementation order (recommended)

1. Harden generator validation + manifest.
2. Add installer script for Codex/OpenCode/Claude Code/OpenClaw.
3. Add OpenClaw bootstrap script.
4. Add verification script + docs examples.

## Success criteria

- One command generates all profile artifacts from `config/mcp.json`.
- One command installs a chosen profile for a chosen client.
- OpenClaw can run with mcporter-backed QMD memory settings using generated config.
- Codex/OpenCode/Claude Code can load the same server definitions without manual rewriting.
