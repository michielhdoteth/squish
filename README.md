# Squish - Memory runtime for production AI agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![npm downloads](https://img.shields.io/npm/dm/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Your agent forgets. Squish fixes that.** It auto-captures useful context, derives durable beliefs like decisions and constraints, and restores that context through CLI, MCP, and a local web UI.

![Squish Demo](squish-demo.gif)

> Squish does not have a crypto token, has no token launch planned, and nobody is authorized to launch one on behalf of the project.

```bash
npm install -g squish-memory
```

## Why Squish

| Without Squish | With Squish |
|----------------|-------------|
| Forgets everything after session | Remembers across sessions |
| Repeats the same mistakes | Learns from past decisions |
| No project awareness | Builds understanding over time |
| Can't track preferences | Adapts to your style |

## Why no second LLM?

Most memory tools require a second LLM to extract, summarize, and manage memories. This adds cost, latency, and complexity to every interaction. Squish takes a different approach:

- **Local-first embeddings**: Memory retrieval uses local embedding models that run on your machine with 1-5ms latency. No API calls, no per-token costs.
- **No memory LLM required**: Signal extraction, belief derivation, and context restoration all work without a secondary language model. Squish uses geometric and keyword-based methods that are deterministic and fast.
- **Lower cost**: Running memory through an LLM adds per-interaction cost. Squish's default path costs $0.
- **Better privacy**: Since no data leaves your machine for memory processing, sensitive context stays local. Encryption and local SQLite storage keep control in your hands.
- **Lower latency**: LLM-based memory extraction typically takes 500-5000ms. Squish processes memory operations in 1-20ms.
- **Simpler setup**: One command install. No API keys. No model configuration. No prompt engineering for memory extraction.

This makes Squish suitable not just for coding assistants but for any agent that needs reliable, fast, and private memory.

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

## For production agents

Squish is built for agents that run autonomously, not just interactive coding sessions. Use cases include:

- **Autonomous agents**: Give long-running agents durable memory so they maintain context across restarts, task switches, and schedule-driven operations.
- **Multi-agent systems**: Shared memory across agent instances enables coordination without requiring agents to share raw conversation history.
- **Embedded devices and edge**: The small package (283 KB gzipped) and local-first design make Squish suitable for resource-constrained environments.
- **Team workflows**: PostgreSQL backend supports shared memory across a team, with the same retrieval and consolidation pipeline running server-side.
- **Scheduled and background agents**: Scheduler resilience means memory operations survive machine sleep and wake cycles without missed maintenance.

The CLI, MCP, and SDK interfaces let you integrate Squish into any agent framework without modifying the agent's core implementation.

## Quick Start

### Agent Auto-Install

Agents: if `squish` is not available on PATH, run:
```bash
npm install -g squish-memory && squish install --all
```
This installs the CLI, MCP server, and plugins for all detected agents (Claude Code, OpenCode, OpenClaw).

### Install the runtime
Install Squish once, then write MCP configs for Claude Code, OpenCode, Codex, and OpenClaw:

```bash
npm install -g squish-memory
squish install --all
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
- **Memory Lifecycle**: Score-based decay and expiration system
- **Graph-boosted retrieval**: associations between memories boost relevance
- **Derived beliefs**: decisions, preferences, and constraints extracted from memories
- **Persistent runtime state**: survives restarts instead of resetting every session
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
- **Passphrase management**: Via `SQUISH_ENCRYPTION_PASSPHRASE` env var (not exposed via MCP)
- Encryption passphrase configured in `.env` file in data directory

### Universal Compatibility
- **CLI**: `squish remember`, `squish recall`, `squish inspect`, `squish context`, `squish stats`, `squish doctor`
- **MCP Server**: Works with Claude Code, OpenCode, Cursor, VS Code, OpenClaw
- **Web UI**: Inspect memories, projects, and recent observations locally
- **SQLite**: Local, zero-config
- **PostgreSQL**: Team mode with Supabase/pgvector

### Current MCP Tools (15 tools)
- `squish_timeline` - 3-layer progressive disclosure
- `squish_remember` - Store memory or learning (auto-detects type)
- `squish_recall` - Recall memories by query or retrieve memory by ID
- `squish_forget` - Delete memory by ID or bulk delete
- `squish_link` - Manage memory associations
- `squish_context` - Get project context
- `squish_health` - Check system health
- `squish_stats` - Get memory statistics
- `squish_inspect` - Inspect memory retention
- `squish_pin` - Pin/unpin memory
- `squish_recent` - Get recent memories
- `squish_stale` - Show stale memories

## Get Started in 10 Seconds

```bash
npm install -g squish-memory
squish install --all
```

Then start using memory in your agent. Zero config. No API keys.

---

## Benchmark Results

Squish achieves 65% on the LoCoMo memory benchmark using local embeddings only -- no memory LLM required. Where an LLM is available for extraction assistance, recall quality improves further.

Real tests using academic benchmarks with local embeddings (no LLM required).

### LoCoMo Memory (1540 questions)
| Category | Score |
|----------|-------|
| Single-hop | 85% |
| Temporal | 95% |
| Open-domain | 98% |
| Multi-hop | 48% |
| Common-sense | 2% |
| **Overall** | **65%** |

### LongMemEval (100 questions)
| Configuration | Score | Breakdown |
|---------------|-------|-----------|
| **Without LLM** | **67.00%** | Temporal: 85%, Multi-session: 40% |
| With LLM | 67.00% | Temporal: 85%, Multi-session: 40% |

Note: LLM extraction helps during storage but scoring uses retrieved context keyword matching.

### Performance
| Metric | Result |
|--------|--------|
| LoCoMo Score | **65%** (no LLM) |
| Embedding Latency | 1-5ms |
| API Latency | 1-20ms |
| Max Throughput | 943 ops/sec |
| Package Size | **283 KB** (gzipped) |

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
- **SQLite/PostgreSQL**: ACID-compliant persistent storage
- **Hybrid retrieval**: combines semantic and keyword ranking for recall

### Runtime Pipeline
- **Signal engine**: classifies captured events as discard, session-only, durable-distilled, or durable-with-raw-fallback
- **Session working set**: persists active working context, active places, and small graph cues between sessions
- **Places**: spatially segment durable memory for retrieval and wake-up continuity
- **Graph**: incrementally enriches durable memories so graph boost applies to cleaner signal
- **Inspection path**: lets you inspect why a memory was retained and whether a raw fallback artifact exists

### Interfaces
- **packages/mcp**: Native agent integration via Model Context Protocol
- **HTTP**: Streamable HTTP server
- **CLI**: Shell and scripts

### Memory Lifecycle
- **Sectors**: episodic, semantic, procedural, autobiographical
- **Status**: active, merged, superseded, expired

### Memory consolidation

Squish uses a geometry-aware approach to keep memory size manageable while preserving signal quality:

- **Score-based decay**: Memories automatically decay through importance scores. High-score memories remain accessible longer, while low-score memories are compressed and archived.
- **Spatial segmentation via Places**: Durable memories are routed into spatial buckets (WIP, Sandbox, Board, Ref) that constrain retrieval to relevant subspaces, reducing noise.
- **Graph enrichment**: Co-occurrence and explicit associations between memories build a graph structure that boosts relevant results during recall without requiring explicit linking.
- **Contradiction handling**: When new facts conflict with stored beliefs, Squish marks prior memories as superseded and preserves revision history rather than overwriting.
- **Expiration and decay**: Temporal facts with expiration dates are automatically pruned. Confidence scores determine how long a memory persists before archival.

## Development

```bash
npm install
npm run build
npm test
npm run verify:mcp
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

---

**Ready to give your agent a memory?**

```bash
npm install -g squish-memory
```

Or visit [squishplugin.dev](https://squishplugin.dev) for docs, benchmarks, and setup guides.

Follow [@squishmem](https://twitter.com/squishmem) for updates.

---

## Links

- [Documentation](https://github.com/michielhdoteth/squish)
- [Benchmarks](docs/BENCHMARK.md)
- [Issues](https://github.com/michielhdoteth/squish/issues)
