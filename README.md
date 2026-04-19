# Squish - Memory Runtime for AI Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![npm downloads](https://img.shields.io/npm/dm/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Your agent forgets. Squish fixes that.** It auto-captures useful context, derives durable beliefs like decisions and constraints, and restores that context through CLI, MCP, and a local web UI.

> Squish does not have a crypto token, has no token launch planned, and nobody is authorized to launch one on behalf of the project.

```bash
bun add squish-memory
```

## Why Squish

| Without Squish | With Squish |
|----------------|-------------|
| Forgets everything after session | Remembers across sessions |
| Repeats the same mistakes | Learns from past decisions |
| No project awareness | Builds understanding over time |
| Can't track preferences | Adapts to your style |

## What It Does

Squish is a forward-only memory runtime for agents:

- **Auto-capture** stores durable signal without relying on the model to remember to save it.
- **Belief derivation** turns memories into decisions, constraints, and preferences that can change future behavior.
- **Context restore** gives a restarted agent the relevant state instead of a cold start.
- **Inspection surfaces** let you see what was stored, what belief was derived, and why it was injected back.

Under the hood, Squish uses a hybrid memory pipeline for signal quality, persistence, and wake-up continuity:

```
User Action ──► Signal Distillation ──► Write Gate ──► Session Working Set
                                                          │
                                                          ├─ Durable Distilled Memory
                                                          ├─ Raw Fallback Snapshot
                                                          └─ SQLite/Postgres + Hybrid Retrieval
```

- **Signal distillation**: Squish suppresses noisy output, keeps session-only context local, and only promotes durable signal.
- **Session working set**: Active files, recent commands, failures, hypotheses, active places, and small graph cues are compacted for the next wake-up.
- **Places**: Durable memories are routed into spatial buckets like `WIP`, `Sandbox`, `Board`, and `Ref` for segmented retrieval.
- **Graph enrichment**: Durable memories strengthen entity and relationship structure used by retrieval scoring.
- **Durable memory**: Stable facts, corrections, decisions, and fixes are stored for long-term retrieval.
- **Raw fallback**: Nuance-sensitive output can keep an internal raw artifact for inspection without polluting normal context.

## Quick Start

### Install with add-mcp (Recommended)
One command installs Squish into Claude Code, OpenCode, Cursor, VS Code, Codex, and other MCP-capable clients:

```bash
npx add-mcp squish-memory
```

Or install the package directly:

```bash
bun add squish-memory
```

New installs should work on first run with the current schema. If you are upgrading an older local install, use `squish doctor --migrate` to repair it forward.

Most memory behavior is automatic once Squish is installed. The CLI remains available for explicit saves, inspection, diagnostics, and one-command demos:

```bash
# Zero-touch demo: show current project context and derived beliefs
squish context --json

# Explicit save when you want to pin something intentionally
squish remember "We chose PostgreSQL for team mode" --type decision

# Inspect why a memory exists and which beliefs it supports
squish inspect <memory-id> --json

# Repair an older install forward if local schema drifted
squish doctor --json --migrate
```

Or use the other shipped surfaces directly:

```bash
# MCP health check / manual startup surface
squish-mcp --health

# Local web UI
squish run web
```

## Features

### Memory Intelligence
- Auto-detects "remember this", "important", corrections
- Distills noisy tool output before durable writes
- Splits events into discarded, session-only, durable, and durable-with-raw-fallback paths
- Handles contradictions when facts change
- Temporal facts with expiration ("until January")
- Confidence scoring for each memory
- **Memory Runtime**: Hot/cold memory lifecycle with automatic decay (hot=active, cold=archived)
- **Graph-boosted retrieval**: associations between memories boost relevance
- **Belief System**: Derived semantic layer - decisions, preferences, constraints extracted from memories
- **Persistent Hot Cache**: Karpathy-style wiki layer that survives restarts (not just session)
- **Scheduler Resilience**: Jobs catch up after machine sleep/wake - no missed maintenance

### Retrieval Quality
- Session wake-up uses compacted working-set context before broad recall
- Place context remains attached to retrieved memories and can shape context selection
- Hybrid search: semantic + keyword (BM25) with Reciprocal Rank Fusion
- Multi-factor ranking: relevance, recency, importance, graph-boost
- LLM-powered context extraction with Ollama (local)
- **Graph associations**: memories linked by coactivation boost search results

### Security & Encryption
- **Client-side encryption**: AES-256-GCM encryption for sensitive memories
- **Passphrase management**: `squish_set_passphrase` and `squish_rotate_key` MCP tools
- Optional encryption via `SQUISH_ENCRYPTION_PASSPHRASE` env var

### Universal Compatibility
- **CLI**: `squish remember`, `squish search`, `squish recall`, `squish inspect`, `squish context`, `squish stats`, `squish doctor`
- **MCP Server**: Works with Claude Code, OpenCode, Cursor, VS Code, OpenClaw
- **Web UI**: Inspect memories, projects, and recent observations locally
- **SQLite**: Local, zero-config
- **PostgreSQL**: Team mode with Supabase/pgvector
- **QMD Integration**: Native .md file search via @tobilu/qmd npm package

### Current MCP Tools
- `squish_search`, `squish_timeline`, `squish_remember`, `squish_recall`, `squish_forget`
- `squish_link`, `squish_context`, `squish_health`, `squish_stats`, `squish_inspect`
- `squish_pin`, `squish_set_passphrase`, `squish_rotate_key`, `squish_recent`, `squish_stale`

## Benchmark Results

Real tests using [LoCoMo](https://github.com/snap-research/locomo) benchmark (22 questions):

| Metric | Result |
|--------|--------|
| **LoCoMo Score** | **77%** |
| Embedding Latency | 1-5ms |
| API Latency | 1-20ms |
| Max Throughput | 943 ops/sec |
| Package Size | **283 KB** |

### Local Runtime Characteristics

| Characteristic | Result |
|----------------|--------|
| Default Cost | $0 local runtime |
| Local-first | Yes |
| Setup | 1 command |
| API keys | Not required for the default path |
| Session continuity | Built in |

## Supported Clients

| Client | Status |
|--------|--------|
| Claude Code | Stable |
| OpenCode | Stable |
| OpenClaw | Stable |
| Cursor | Beta |
| VS Code | Beta |
| Windsurf | Beta |

## Configuration

**Zero config required** - works out of the box with local embeddings.

For customization:

```bash
# Environment variables
SQUISH_DATA_DIR=./.squish
SQUISH_EMBEDDINGS_PROVIDER=ollama  # openai, ollama, google, local
SQUISH_OLLAMA_URL=http://localhost:11434

# Team mode
DATABASE_URL=postgresql://user:pass@host/db
```

## Architecture

### Two-Tier Memory
- **QMD (Files)**: BM25 + vectors for fast recall
- **SQLite/PostgreSQL**: ACID-compliant persistent storage

### Runtime Pipeline
- **Signal engine**: classifies captured events as discard, session-only, durable-distilled, or durable-with-raw-fallback
- **Session working set**: persists active working context, active places, and small graph cues between sessions
- **Places**: spatially segment durable memory for retrieval and wake-up continuity
- **Graph**: incrementally enriches durable memories so graph boost applies to cleaner signal
- **Inspection path**: lets you inspect why a memory was retained and whether a raw fallback artifact exists

### Interfaces
- **MCP**: Native agent integration
- **HTTP**: REST + WebSocket
- **CLI**: Shell and scripts

### Memory Lifecycle
- **Sectors**: episodic, semantic, procedural, autobiographical
- **Tiers**: hot (recent), warm (accessible), cold (archived)
- **Status**: active, merged, superseded, expired

## Development

```bash
bun install
bun run build
bun test
bun run verify:mcp
```

## Troubleshooting

```bash
# Repair an older local install forward
squish doctor --migrate

# Zero-touch runtime check
squish context --json

# MCP health check
squish-mcp --health
```

## License

MIT License. See [LICENSE](LICENSE).

## Links

- [Documentation](https://github.com/michielhdoteth/squish)
- [Benchmarks](docs/BENCHMARK.md)
- [Issues](https://github.com/michielhdoteth/squish/issues)
