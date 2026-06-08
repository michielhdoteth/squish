# Squish Release Notes

## v1.6.0

### Summary

Three-tool session model, personal info anonymization, and preparation for public release.

### Highlights

#### Three-Tool Session Model
- Replaced multi-tool session lifecycle with a clean three-tool model: `on_session_start`, `on_tool_use`, `on_session_end`
- Session context injection consolidated into `on_session_start`
- Tool use observations captured via `on_tool_use`
- Session cleanup handled by `on_session_end`

#### Privacy & Anonymization
- Added personal info anonymization for memory storage
- Sensitive data detected and redacted before durable writes

#### Public Release Preparation
- Documentation overhaul for external audiences
- CLI reference consolidated into single `CLI.md`
- Installation guides verified across all supported clients

### User-Facing Impact

#### CLI
- New: `squish context` (replaces legacy `core_memory`)
- Improved: `squish install --all` (universal installer)

#### MCP
- New: `squish_list_pinned`
- New: `squish_on_session_start`
- New: `squish_on_tool_use`
- New: `squish_on_session_end`

---

## v1.5.0

### Summary

Schema fixes, plugin system improvements, tier removal, multi-place routing, and enhanced retrieval quality.

### Highlights

#### Schema & Storage Fixes
- Fixed schema inconsistencies across SQLite and PostgreSQL
- Removed tier system in favor of unified memory storage
- Improved migration safety for schema changes

#### Plugin System
- Refactored plugin architecture for better extensibility
- Improved client detection and installation flow

#### Multi-Place Routing
- Memories can now be routed to multiple places based on content signals
- Tag-aware retrieval for more precise memory recall
- Supersession filtering to reduce noise in search results

#### Trace Metadata
- Added trace metadata for debugging memory operations
- Improved inspect tool with detailed routing information

### User-Facing Impact

#### CLI
- Improved: `squish inspect` with trace metadata
- Fixed: `squish stats` accuracy

#### MCP
- Improved: `squish_inspect` with routing details
- Improved: `squish_recall` with tag filtering

---

## v1.3.0

### Summary

Stats fix, cloud-api rename, graph export, cold-only cloud sync, MEMORY.md hot tier, hook scripts, and security fixes.

### Highlights

#### Stats Fix
- Fixed memory statistics calculation for accurate counts

#### Cloud API Rename
- Renamed cloud API endpoints for consistency

#### Graph Export
- Added ability to export knowledge graph data

#### Cold-Only Cloud Sync
- Cloud sync now only handles cold storage, reducing bandwidth usage

#### MEMORY.md Hot Tier
- MEMORY.md files now participate in the hot memory tier
- Faster access to frequently referenced documentation

#### Hook Scripts
- Added hook scripts for session lifecycle events
- Improved plugin integration with coding assistants

#### Security Fixes
- Patched secret detection bypass vulnerabilities
- Improved PII filtering accuracy

### User-Facing Impact

#### CLI
- New: `squish export` for graph data
- Fixed: `squish stats` accurate counting

#### MCP
- Improved: `squish_health` with cloud sync status

---

## v1.2.0

Planned release date: 2026-04-19

## Summary

This release turns Squish from a command-heavy memory store into a more automatic memory runtime. The main theme is better signal quality: capture broadly, suppress noise, keep session-only state local, store cleaner durable memory, and wake agents up with useful context instead of raw history.

## Highlights

### Signal-Aware Memory Runtime
- Captured events are classified before durable write: `discard`, `session-only`, `durable-distilled`, or `durable-raw+distilled`
- Session working-set state now tracks active files, recent commands, failures, hypotheses, active places, and lightweight graph cues
- Nuance-sensitive durable events can retain linked raw fallback artifacts for inspection and rewind

### Places And Graph In The Same Loop
- Durable writes now participate in place routing and incremental graph enrichment
- Session wake-up prioritizes compact working-set state over generic recent-memory dumps
- Retrieval prefers cleaner distilled memory while preserving reversibility where raw fallback exists

### Trust-Focused CLI And MCP Surfaces
- Added `squish health`
- Added `squish inspect` and MCP `squish_inspect`
- `squish context`, `squish stats`, `squish health`, and `squish doctor` now explain current project, runtime state, degradation, and next step
- Legacy placeholder `.` projects are hidden from normal runtime views
- Legacy memories now inspect as `legacy-durable` instead of `unknown`

## User-Facing Impact

### CLI
- New: `squish health`
- New: `squish inspect <id>`
- Improved: `squish context`
- Improved: `squish stats`
- Improved: `squish doctor`

### MCP
- New: `squish_inspect`
- Improved: `squish_context`
- Improved: `squish_health`
- Improved: `squish_stats`

## Verification Used For Release Prep

- `bun test tests/core/trust-report.test.ts tests/core/trust-state.test.ts tests/core/memory-explain.test.ts tests/core/session-working-set.test.ts tests/core/signal-engine.test.ts tests/core/write-gate.test.ts`
- `squish doctor`
- `squish doctor --json`
- `squish context --json --limit 2`
- `squish stats`
- `squish inspect <legacy-memory-id>`
- `squish-mcp --health`

## Notes

- Empty-state runtime status can still show `degraded` before any real capture has happened; that is an initialization-state signal, not a crash signal.
- Repo-local helper files used during development were left untouched unless they are part of the shipping surface.
