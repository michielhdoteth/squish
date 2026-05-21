# Squish - Your agent remembers. Every session.

[![GitHub release](https://img.shields.io/github/v/release/michielhdoteth/squish)](https://github.com/michielhdoteth/squish/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![LoCoMo Score](https://img.shields.io/badge/LoCoMo-65%25_%F0%9F%93%8A-success)](docs/BENCHMARK.md)
[![Package Size](https://img.shields.io/badge/size-283_KB_gzipped-blueviolet)](https://www.npmjs.com/package/squish-memory)
[![MCP Tools](https://img.shields.io/badge/MCP-15_tools-3B82F6)](packages/mcp/)
[![Zero LLM Cost](https://img.shields.io/badge/cost-%240_local-22C55E)](https://squishplugin.dev)

**Every agent forgets when the session ends. Squish fixes that.** It auto-captures useful context, derives durable beliefs like decisions and constraints, and restores that context through CLI, MCP, and a local web UI -- so your next session starts where the last one stopped. Zero re-explaining.

```
Session 1: "Build auth middleware"
  Agent writes code in src/middleware/auth.ts, uses jose for JWT
  Squish silently captures: stack decisions, file usage, patterns
  Session ends -> compressed into durable memory

Session 2: "Add rate limiting"
  Agent already knows:
    - Auth sits at src/middleware/auth.ts
    - You chose jose over jsonwebtoken
    - Test pattern in auth.test.ts
  Zero re-explaining. Starts working immediately.
```

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

```bash
npm install -g squish-memory && squish install --all
```

## Works With Every Agent

Squish speaks MCP and HTTP. One server, memories shared across all of them.

<div align="center">
<table>
  <tr>
    <td align="center" width="120">
      <img src="https://github.com/anthropics.png?size=80" width="40" height="40" alt="Claude Code" /><br/>
      <strong>Claude Code</strong><br/>
      <span style="color:#22C55E;">Stable</span>
    </td>
    <td align="center" width="120">
      <img src="https://github.com/opencode-ai.png?size=80" width="40" height="40" alt="OpenCode" /><br/>
      <strong>OpenCode</strong><br/>
      <span style="color:#22C55E;">Stable</span>
    </td>
    <td align="center" width="120">
      <img src="https://github.com/openclaw.png?size=80" width="40" height="40" alt="OpenClaw" /><br/>
      <strong>OpenClaw</strong><br/>
      <span style="color:#22C55E;">Stable</span>
    </td>
    <td align="center" width="120">
      <img src="https://github.com/getcursor.png?size=80" width="40" height="40" alt="Cursor" /><br/>
      <strong>Cursor</strong><br/>
      <span style="color:#F59E0B;">Beta</span>
    </td>
    <td align="center" width="120">
      <img src="https://github.com/microsoft.png?size=80" width="40" height="40" alt="VS Code" /><br/>
      <strong>VS Code</strong><br/>
      <span style="color:#F59E0B;">Beta</span>
    </td>
    <td align="center" width="120">
      <img src="https://github.com/codeium.png?size=80" width="40" height="40" alt="Windsurf" /><br/>
      <strong>Windsurf</strong><br/>
      <span style="color:#F59E0B;">Beta</span>
    </td>
  </tr>
  <tr>
    <td align="center" width="120">
      <img src="https://github.com/cline.png?size=80" width="40" height="40" alt="Cline" /><br/>
      <strong>Cline</strong><br/>
      MCP
    </td>
    <td align="center" width="120">
      <img src="https://github.com/block.png?size=80" width="40" height="40" alt="Goose" /><br/>
      <strong>Goose</strong><br/>
      MCP
    </td>
    <td align="center" width="120">
      <img src="https://github.com/google-gemini.png?size=80" width="40" height="40" alt="Gemini CLI" /><br/>
      <strong>Gemini CLI</strong><br/>
      MCP
    </td>
    <td align="center" width="120">
      <img src="https://github.com/Aider-AI.png?size=80" width="40" height="40" alt="Aider" /><br/>
      <strong>Aider</strong><br/>
      MCP
    </td>
    <td align="center" width="120">
      <strong>Any MCP</strong><br/>
      <span style="color:#9CA3AF;">Client</span>
    </td>
  </tr>
</table>
</div>
<p align="center"><em>Works with any agent that speaks MCP or HTTP. One server, memories shared across all of them.</em></p>

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

## Quick Start

### Try it in 10 seconds

```bash
npm install -g squish-memory
squish install --all
```

Then start using memory in your agent. Zero config. No API keys.

Or explore the memory surfaces directly:

```bash
# Zero-touch demo: show current project context and derived beliefs
squish context --json

# Explicit save when you want to pin something intentionally
squish remember "We chose PostgreSQL for team mode" --type decision

# Inspect why a memory exists and which beliefs it supports
squish inspect <memory-id> --json
```

### Local web UI (free, runs on your machine)

```bash
squish run web
# Opens at http://localhost:37777
```

Browse memories, observations, and project context in a local dashboard. No cloud dependency. Runs entirely on your machine.

### MCP Server

```bash
squish-mcp --health
```

Works with any MCP-compatible agent. Add this to your agent's MCP config:

```json
{
  "mcpServers": {
    "squish": {
      "command": "npx",
      "args": ["-y", "squish-memory"],
      "env": {}
    }
  }
}
```

## What It Does

Squish is a forward-only memory runtime for agents:

- **Auto-capture** stores durable signal without relying on the model to remember to save it.
- **Belief derivation** turns memories into decisions, constraints, and preferences that can change future behavior.
- **Context restore** gives a restarted agent the relevant state instead of a cold start.
- **Inspection surfaces** let you see what was stored, what belief was derived, and why it was injected back.

Under the hood, Squish uses a hybrid memory pipeline:

```
User Action --> Signal Distillation --> Write Gate --> Session Working Set
                                                          |
                                                          +-- Durable Distilled Memory
                                                          +-- Raw Fallback Snapshot
                                                          +-- SQLite/Postgres + Hybrid Retrieval
```

- **Signal distillation**: Suppresses noisy output, keeps session-only context local, only promotes durable signal.
- **Places**: Durable memories are routed into spatial buckets (WIP, Sandbox, Board, Ref) for segmented retrieval.
- **Graph enrichment**: Durable memories strengthen entity and relationship structure used by retrieval scoring.
- **Hybrid retrieval**: BM25 + semantic search with Reciprocal Rank Fusion for relevance, recency, and importance.

## Features

### Memory Intelligence
- Auto-detects "remember this", "important", corrections
- Distills noisy tool output before durable writes
- Splits events into discarded, session-only, durable, and durable-with-raw-fallback paths
- Handles contradictions when facts change
- Temporal facts with expiration ("until January")
- Confidence scoring for each memory
- Score-based decay and expiration
- Graph-boosted retrieval
- Derived beliefs: decisions, preferences, constraints
- Persistent runtime state across restarts

### Security & Encryption
- **AES-256-GCM encryption** for sensitive memories
- Passphrase management via `SQUISH_ENCRYPTION_PASSPHRASE` env var
- Local SQLite or shared PostgreSQL

### Interfaces
- **CLI**: `squish remember`, `recall`, `inspect`, `context`, `stats`, `doctor`
- **MCP Server**: 15 tools for any MCP-compatible agent
- **Web UI**: Local dashboard at `localhost:37777`
- **HTTP API**: For programmatic access

### Current MCP Tools (15)

| Tool | Description |
|------|-------------|
| `squish_timeline` | 3-layer progressive disclosure |
| `squish_remember` | Store memory or learning (auto-detects type) |
| `squish_recall` | Recall memories by query or retrieve by ID |
| `squish_forget` | Delete memory by ID or bulk delete |
| `squish_link` | Manage memory associations |
| `squish_context` | Get project context |
| `squish_health` | Check system health |
| `squish_stats` | Get memory statistics |
| `squish_inspect` | Inspect memory retention |
| `squish_pin` | Pin/unpin memory |
| `squish_recent` | Get recent memories |
| `squish_stale` | Show stale memories |

## Benchmark Results

Squish achieves **65% on the LoCoMo memory benchmark** using local embeddings only -- no memory LLM required. Where an LLM is available for extraction assistance, recall quality improves further.

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
| Configuration | Score |
|---------------|-------|
| Without LLM | 67.00% |
| With LLM | 67.00% |

### Performance
| Metric | Result |
|--------|--------|
| Embedding Latency | 1-5ms |
| API Latency | 1-20ms |
| Max Throughput | 943 ops/sec |
| Package Size | **283 KB** (gzipped) |
| Default Cost | $0 local runtime |
| Setup | 1 command |
| API Keys | Not required |

## For production agents

Squish is built for agents that run autonomously, not just interactive coding sessions:

- **Autonomous agents**: Long-running agents maintain context across restarts, task switches, and schedule-driven operations.
- **Multi-agent systems**: Shared memory across agent instances enables coordination without sharing raw conversation history.
- **Embedded devices and edge**: 283 KB gzipped, local-first, resource-efficient.
- **Team workflows**: PostgreSQL backend supports shared memory across a team.
- **Scheduled and background agents**: Scheduler resilience survives sleep/wake cycles.

## Configuration

**Zero config required** -- works out of the box with local embeddings.

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
- **Hybrid retrieval**: semantic + keyword (BM25) with Reciprocal Rank Fusion

### Memory Consolidation
- **Score-based decay**: Memories auto-decay through importance scores
- **Spatial segmentation via Places**: Buckets (WIP, Sandbox, Board, Ref) constrain retrieval
- **Graph enrichment**: Co-occurrence and explicit associations boost relevance
- **Contradiction handling**: Conflicting facts are marked superseded, preserving history
- **Expiration**: Temporal facts auto-prune

## Development

```bash
npm install
npm run build
npm test
npm run verify:mcp
```

## Troubleshooting

```bash
# Repair an older install
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
