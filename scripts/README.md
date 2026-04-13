# Squish Scripts

This directory contains essential build, installation, verification, and release scripts for the Squish project.

## Essential Scripts (Required for Build/Install/Release)

### Build & Runtime
- **`copy-runtime-assets.mjs`** - Copies runtime assets (e.g., sqlite WASM) to dist/. Run automatically during `npm run build`.
- **`init-dirs.mjs`** - Initializes required directories (~/.squish). Run automatically after `npm install` (postinstall hook).

### Installation
- **`install-interactive.mjs`** - Interactive installer wizard. Run with `npm run install`.
- **`install-plugin.mjs`** - Unified plugin installer for all supported clients (Claude Code, OpenCode, Codex, OpenClaw). Used by the add-mcp command and for manual installation.

### Verification & Testing
- **`verify-mcp.mjs`** - Verifies MCP configuration and artifacts. Run during release and CI.
- **`test-interactive.mjs`** - Interactive test runner with filtering and reporting.
- **`check-secrets.js`** - Scans for accidentally committed secrets. Run as pre-commit hook.

### Dependency Management
- **`dependency-manager.mjs`** - Checks and installs dependencies for different clients. Commands: `npm run deps:check`, `npm run deps:install`.
- **`detect-clients.mjs`** - Detects installed AI clients and their locations. Run with `npm run detect:clients`.

### Deployment & Reliability
- **`remote-preflight.mjs`** - Preflight checks for remote deployments. Run with `npm run preflight:remote`.
- **`squish-fallback.mjs`** - MCP fallback mechanism for handling failures. Run with `npm run fallback:dry` for simulation.

### Release Automation
- **`build-release.sh`** - Orchestrates full release build (Linux/macOS). Run with `npm run release`.
- **`github-release.sh`** - Creates GitHub release with assets. Part of the release process.

## Scripts Reference

| Script | Purpose | Invocation |
|--------|---------|------------|
| `copy-runtime-assets.mjs` | Copy WASM and other assets to dist | `npm run build` (automatic) |
| `generate-mcp.mjs` | Generate MCP configuration files | `node scripts/generate-mcp.mjs` |
| `verify-mcp.mjs` | Verify MCP artifacts are valid | `node scripts/verify-mcp.mjs` |
| `init-dirs.mjs` | Create ~/.squish and other dirs | `npm install` (automatic) |
| `install-interactive.mjs` | Interactive installation wizard | `npm run install` |
| `install-plugin.mjs` | Install plugin for specific client | `node scripts/install-plugin.mjs --client=<name>` |
| `dependency-manager.mjs` | Manage client dependencies | `npm run deps:check`, `npm run deps:install` |
| `detect-clients.mjs` | Detect installed AI clients | `npm run detect:clients` |
| `test-interactive.mjs` | Interactive test runner | `npm run test:interactive` |
| `remote-preflight.mjs` | Remote deployment checks | `npm run preflight:remote` |
| `squish-fallback.mjs` | MCP fallback simulation | `npm run fallback:dry` |
| `check-secrets.js` | Scan for secrets in code | `npm run check:secrets` |
| `build-release.sh` | Build release packages | `npm run release` (Linux/macOS) |
| `github-release.sh` | Publish to GitHub Releases | `npm run release` (part of) |

## Notes

- All scripts are written in JavaScript (ESM) or shell (`.sh`) for portability.
- Scripts prefixed with `node` are run with Node.js. Use `bun` for faster execution if available.
- Release scripts (`build-release.sh`, `github-release.sh`) are designed for CI/CD environments.
- The `install-plugin.mjs` script is the unified installer that replaced legacy `install-mcp.mjs` and `openclaw-bootstrap.mjs`.

## Developer Scripts

Development and debugging utilities are in scripts/ for build/dev workflows.
