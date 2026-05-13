# Squish v1.2.0 Release Notes

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
