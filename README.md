# Squish -- Memory Runtime for AI Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dt/squish-memory?color=green)](https://www.npmjs.com/package/squish-memory)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/michielhdoteth/squish)

> 4.5k+ npm downloads. Local-first. No external LLM required.

**Squish is a local-first memory runtime for AI coding agents.** It gives every AI agent persistent memory using local embeddings with zero LLM dependency. If you use Claude Code, Cursor, Codex, Copilot, Gemini CLI, or any MCP-compatible tool and want your agents to remember decisions, constraints, and context across sessions -- Squish is the MCP memory server that works locally and optionally syncs to the cloud.

```bash
npm install -g squish-memory && squish install --all
```

Squish provides AI agent memory that persists between sessions, across agents, and across machines. It is a local-first MCP server with built-in embeddings, a knowledge graph, and hybrid retrieval -- no external database or API key required. Use it for free locally, or enable Squish Cloud for cross-device sync.

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

## The Problem: Agents Forget Everything

Every AI coding agent starts from zero when a new session begins. The architecture decision from last week, the config you spent an hour debugging, the preference you mentioned yesterday -- gone.

Built-in memory files like CLAUDE.md and .cursorrules help, but they have hard limits. They cap out around 200 lines, require manual curation, and do not work across agents. You end up copy-pasting the same context into every tool.

Squish gives you persistent memory for coding agents that scales without limits. No manual maintenance. No token waste. No agent lock-in.

### Three Layers of Memory

| Layer | What It Does | Command |
|-------|-------------|---------|
| **Recall** | Durable memory -- decisions, preferences, constraints that persist across sessions | `squish recall` |
| **Sessions** | Searchable history -- past agent runs you can inspect for evidence and context | `squish sessions search` |
| **Remember** | Write to long-term memory -- store new facts, decisions, observations | `squish remember` |

### Token Cost Comparison

| Method | Token Usage | Cost per Session | Cross-Agent | Auto-Capture |
|--------|-------------|------------------|-------------|--------------|
| Paste full context | ~2,000 tokens | $0.06 - $0.12 | No | No |
| LLM-summarized context | ~500 tokens | $0.02 - $0.05 | No | No |
| CLAUDE.md / .cursorrules | ~200 lines max | Free | No | No |
| **Squish (local)** | **~50-200 tokens** | **$0.00** | **Yes** | **Yes** |
| **Squish (Cloud)** | **~50-200 tokens** | **$0.00** | **Yes** | **Yes** |

Squish retrieves only the relevant memories for the current task. The average context injection is 50-200 tokens -- a fraction of what you would paste manually.

---

## Quick Start

### Step 1: Install

```bash
npm install -g squish-memory && squish install --all
```

This installs the Squish CLI, MCP server, and plugin hooks for all detected agents.

### Step 2: Work

Start your coding agent as usual. Squish runs in the background, auto-capturing decisions, constraints, preferences, and context.

```bash
squish remember "We chose PostgreSQL for team mode" --type decision
squish recall "project decisions"
```

### Step 3: Search Past Sessions

After a few sessions, search your agent history:

```bash
squish sessions search "postgres migration"
squish sessions related --repo-path .
```

### Step 4: Restart

Close your session and open a new one. Your agent picks up where you left off -- all context is restored automatically.

```bash
squish context    # See what your agent remembers
squish stats      # Check memory health
```

Works locally free. Optional cloud sync available at [squishplugin.dev](https://squishplugin.dev).

---

## Works with Every Agent

Squish works with any AI coding agent that supports MCP (Model Context Protocol) or HTTP connections. One memory server, shared across all of them.

| Agent | Integration Method | Notes |
|-------|-------------------|-------|
| Claude Code | MCP server + plugin | Auto-captures via hooks |
| Codex CLI | MCP server | OpenAI's CLI agent |
| GitHub Copilot CLI | MCP server | VS Code integration |
| Cursor | MCP server | Editor + agent |
| Gemini CLI | MCP server | Google's CLI agent |
| OpenCode | MCP server + hooks | Auto-capture + MCP tools |
| Cline | MCP server | VS Code extension |
| Goose | MCP server | Block's agent |
| Kilo Code | MCP server | VS Code extension |
| Windsurf | MCP server | Codeium's editor |
| Roo Code | MCP server | VS Code extension |
| Claude Desktop | MCP server | Desktop app |
| Aider | MCP server | Terminal pair programmer |
| ChatGPT | MCP server (via Squish Cloud) | Cloud sync required |
| VS Code (Copilot) | MCP server | Via MCP extension |

**Works with any agent that speaks MCP or HTTP. One server, memories shared across all of them.**

### MCP Server Configuration

Add Squish to any MCP-compatible client:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": ["--http", "--port", "8767"],
      "env": {
        "SQUISH_DB_PATH": "./squish-data"
      }
    }
  }
}
```

For cloud-connected agents:

```json
{
  "mcpServers": {
    "squish-cloud": {
      "type": "url",
      "url": "https://api.squishplugin.dev/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

---

## Why Squish

Most memory tools need a second LLM for embeddings and retrieval. That means extra API costs, latency, and infrastructure you have to manage.

Squish uses local embeddings by default. Zero LLM dependency. 1-5ms latency. $0 runtime cost in local mode.

### Comparison

| Feature | Squish | Built-in (CLAUDE.md) | agentmemory | mem0 |
|---------|--------|----------------------|-------------|------|
| Auto-capture | Yes (hooks) | Manual | Yes (12 hooks) | Manual API |
| Local embeddings | Yes (default) | N/A | Yes | No (cloud) |
| External DB required | No (SQLite) | No | Yes (iii-engine) | Yes (Qdrant) |
| MCP tools | 15 | 0 | 53 | 9 |
| Knowledge graph | Yes | No | Yes | No |
| Cross-agent sync | Yes (Cloud) | No | No | API-based |
| Price | Free local / $9/mo cloud | Free | Free | $249/mo Pro |
| Setup time | 30 seconds | 5 minutes | 15 minutes | 30 minutes |
| Data ownership | Full (local SQLite) | Git repo | External DB | Cloud vendor |

---

## Features

### Memory Intelligence

- Auto-captures decisions, constraints, and preferences as you work
- Restores relevant context when an agent restarts
- Handles contradictions and temporal facts with expiration
- Graph-boosted retrieval connects related memories across sessions
- Contradiction detection flags conflicting information
- Temporal reasoning tracks when facts were true vs. now
- Confidence scoring adjusts memory relevance over time
- Decay system automatically ages low-value memories

### Session Search

- Search previous Claude Code, Codex, and OpenCode sessions
- Find related sessions by project path or file overlap
- Inspect past decisions, errors, and commands as evidence
- Separate from long-term memory -- raw session history, not distilled facts

### Interfaces

- **CLI**: `squish remember`, `recall`, `inspect`, `context`, `stats`, `search`, `sessions`
- **MCP Server**: 15 tools for any MCP client -- recall, health, graph, recency, maintenance
- **Web UI**: Local dashboard at `localhost:37777` for visualizing memories
- **Cloud Dashboard**: Analytics and management at [squishplugin.dev](https://squishplugin.dev)

### Storage

- SQLite (local, default) or PostgreSQL (team mode)
- Hybrid retrieval: keyword + semantic similarity with RRF fusion
- AES-256-GCM encryption for sensitive memories
- Places routing: organize memories by project, feature, or context
- Full-text search with BM25 ranking
- Vector search with TF-IDF embeddings (768-dimensional)

### Memory Pipeline

Squish uses a 4-stage pipeline to process memories:

1. **Capture** -- Filters noisy tool output, promotes what matters (decisions, constraints, preferences)
2. **Filter** -- Deduplicates, resolves contradictions, scores importance
3. **Store** -- Persists to SQLite/PostgreSQL with graph relationships and embeddings
4. **Retrieve** -- Hybrid search combines keyword, semantic, recency, and importance scoring

---

## Architecture

```
Agent Action
    |
    v
[1. Capture] -----> Filter noisy output
    |               Promote decisions, constraints, preferences
    v
[2. Store] -------> SQLite / PostgreSQL
    |               Embeddings (local TF-IDF)
    |               Knowledge graph edges
    |               Places routing
    v
[3. Retrieve] ----> Keyword search (BM25)
    |               Semantic search (cosine similarity)
    |               Recency weighting
    |               RRF fusion scoring
    v
[4. Context] -----> Inject relevant memories into agent context
                    50-200 tokens average
                    Auto-decay old/low-value memories
```

### Three-Layer Memory Model

```
+------------------+     +------------------+     +------------------+
|   RECALL         |     |   SESSIONS       |     |   REMEMBER       |
|   (durable)      |     |   (evidence)     |     |   (write)        |
|                  |     |                  |     |                  |
|  Decisions       |     |  Past agent runs |     |  Store new facts |
|  Preferences     |     |  Searchable      |     |  Auto-classify   |
|  Constraints     |     |  Raw history     |     |  Graph update    |
|  Beliefs         |     |  Related repos   |     |  Place routing   |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
   squish recall          squish sessions          squish remember
   squish_recall          search/show/list         squish_remember
```

### Storage Layer

```
SQLite (default)               PostgreSQL (team mode)
    |                               |
    v                               v
+------------------+          +------------------+
| memories         |          | memories         |
| associations     |          | associations     |
| embeddings       |          | embeddings       |
| graph_edges      |          | graph_edges      |
| places           |          | places           |
| sessions         |          | sessions         |
+------------------+          +------------------+
| AES-256-GCM     |          | AES-256-GCM     |
| encryption       |          | encryption       |
+------------------+          +------------------+
```

---

## Squish Cloud

Persistent memory across ChatGPT, Claude Desktop, Claude Code, and local agents. One account, synchronized everywhere.

```
  ChatGPT          Claude Desktop     Claude Code       Local Agents
 [OAuth 2.1]       [OAuth 2.1]     [Streamable HTTP]  [MCP / CLI]
      +-------------------+---------------+------------------+
                          |
                  Squish Cloud API
                          |
                 [PostgreSQL + Encrypted Storage]
                          |
                  Admin Dashboard & Analytics
```

**Cloud features:** OAuth 2.1 + PKCE login, cross-platform sync, team workspaces, admin dashboard, priority support.

### Pricing

| Tier | Price | Storage | Users | Features |
|------|-------|---------|-------|----------|
| Local | Free | Local SQLite | 1 | Full memory, CLI, MCP, Web UI |
| Cloud Solo | $9/mo | 50 MB synced | 1 | Cloud sync, OAuth, dashboard |
| Cloud Pro | $29/mo | 250 MB synced | 1 | Pro features, priority support |
| Team | $99/mo | 1 GB shared | Up to 10 | Shared workspaces, admin |
| Founder Pass | $99/yr | Pro features | 1 | Launch-only annual pricing |

[Sign up at squishplugin.dev](https://squishplugin.dev) -- 30 seconds, no credit card needed.

> **Founder Pass** is a launch-only offer. $99/year instead of $348/year (Pro monthly).

---

## Installation Guides

- [Claude Code](docs/install/claude-code.md) -- MCP server + plugin hooks for auto-capture
- [OpenCode](docs/install/opencode.md) -- MCP server + hooks for OpenCode agent
- [OpenClaw](docs/install/openclaw.md) -- MCP server setup for OpenClaw

### Quick install for all detected agents:

```bash
npm install -g squish-memory && squish install --all
```

Squish auto-detects which agents you have installed and configures hooks for each one.

---

## Benchmarks

Squish is tested against real-world memory retrieval tasks and synthetic benchmarks.

| Metric | Result | Notes |
|--------|--------|-------|
| Core Tests | 9/9 passed (100%) | All memory operations |
| LoCoMo Memory | 65% | 100 REAL questions from locomo10.json |
| Throughput | 39 ops/sec | With local embeddings |
| Total Time | 230ms | For 9 core tests |
| Package Size | 283 KB | Lightweight footprint |
| Latency (embed) | 6.6ms | Local TF-IDF embeddings |
| Latency (search) | 6.1ms | Hybrid retrieval |

Full benchmark details: [docs/BENCHMARK.md](docs/BENCHMARK.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLI Reference](docs/CLI.md) | All CLI commands and options |
| [MCP Server](docs/MCP-SERVER.md) | 15 MCP tools and configuration |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [Decay System](docs/DECAY.md) | How memories age and lose relevance |
| [Scoring](docs/v2-scoring.md) | Importance and relevance scoring |
| [Environment Config](docs/ENV-CONFIG.md) | Environment variables and settings |
| [Plugin Architecture](docs/PLUGIN-ARCHITECTURE.md) | Hook system and agent integration |
| [Quick Start](docs/INSTALL-QUICKSTART.md) | Getting started guide |
| [Agent Comparison](docs/agent-memory-comparison.md) | Squish vs other memory tools |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute |
| [Release Notes](docs/RELEASE_NOTES.md) | Changelog and version history |

---

## FAQ

### What is Squish?

Squish is a local-first memory runtime for AI coding agents. It gives your agents persistent memory using local embeddings with zero LLM dependency. Think of it as a brain that persists between sessions -- your agents remember decisions, constraints, preferences, and context without you having to re-explain everything. In v1.6.0, Squish also searches past agent sessions as evidence, so agents can inspect prior work instead of starting from zero.

### Does Squish require an API key?

No. Squish works locally by default with zero API keys. It uses local embeddings (TF-IDF) and SQLite storage. An API key is only needed if you want to use Squish Cloud for cross-device sync.

### How does Squish compare to mem0 or agentmemory?

Squish is the only option that works locally with zero external dependencies. mem0 requires Qdrant (a vector database) and cloud API calls. agentmemory requires iii-engine. Squish uses SQLite and local embeddings by default. See the full comparison in the [Why Squish](#why-squish) section above.

### Can I use Squish with multiple AI agents?

Yes. Squish works with any MCP-compatible agent. One memory server is shared across Claude Code, Cursor, Codex, Copilot, Gemini CLI, and any other agent that supports MCP. Memories are available to all connected agents.

### Is my data private with Squish?

Yes. In local mode, all data stays on your machine in an encrypted SQLite database. Nothing is sent to any cloud service. AES-256-GCM encryption protects sensitive memories. In cloud mode, data is encrypted in transit and at rest.

### What databases does Squish support?

Squish supports SQLite (default, local) and PostgreSQL (team mode). SQLite requires zero configuration. PostgreSQL is used for team workspaces and shared memory across multiple users.

### What is the difference between recall and sessions?

`squish recall` searches your long-term memory -- distilled facts, decisions, and preferences that Squish has captured and organized. `squish sessions search` searches raw past agent runs -- the actual messages, commands, and file changes from previous Claude Code, Codex, or OpenCode sessions. Recall gives you what the system decided to remember. Sessions give you the evidence.

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines on how to contribute to Squish.

---

## License

MIT -- see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://squishplugin.dev">Website</a> &middot;
  <a href="https://squishplugin.dev">Cloud Dashboard</a> &middot;
  <a href="docs/">Documentation</a> &middot;
  <a href="https://api.squishplugin.dev/.well-known/oauth-authorization-server">OAuth Metadata</a>
</p>
