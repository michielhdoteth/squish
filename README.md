# Squish — Memory Runtime for AI Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dt/squish-memory?color=green)](https://www.npmjs.com/package/squish-memory)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/michielhdoteth/squish)

> 4.5k+ npm downloads. Local-first. Optional LLM support.
>
> Star the repo if Squish saves you context.

**Squish gives agents stable orientation, durable memory, and searchable session history across runs.** Local-first. Optional LLM support. Works with Claude Code, Cursor, Codex, Copilot, Gemini CLI, and any MCP-compatible tool.

```bash
npm install -g squish-memory && squish install --all
```

Squish provides AI agent memory that persists between sessions, across agents, and across machines. It is a local-first MCP server with built-in embeddings, a knowledge graph, and hybrid retrieval — no external database or API key required. Use it for free locally, or enable Squish Cloud for cross-device sync.

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

### Core Concepts

<table>
  <tr><th>Concept</th><th>What It Is</th></tr>
  <tr><td><strong>Recall</strong></td><td>Durable memory — decisions, preferences, constraints</td></tr>
  <tr><td><strong>Sessions</strong></td><td>Evidence from past agent runs</td></tr>
  <tr><td><strong>Pinned</strong></td><td>Stable facts that do not decay</td></tr>
  <tr><td><strong>Beliefs</strong></td><td>Passive model of user/project</td></tr>
  <tr><td><strong>Strategies</strong></td><td>Active operating rules</td></tr>
  <tr><td><strong>Decay</strong></td><td>Stale weak traces fade automatically</td></tr>
  <tr><td><strong>Graph</strong></td><td>Reinforced relationships from usage</td></tr>
</table>

---

## The Problem: Agents Forget Everything

Every AI coding agent starts from zero when a new session begins. The architecture decision from last week, the config you spent an hour debugging, the preference you mentioned yesterday — gone.

Built-in memory files like CLAUDE.md and .cursorrules help, but they have hard limits. They cap out around 200 lines, require manual curation, and do not work across agents. You end up copy-pasting the same context into every tool.

Squish gives you persistent memory for coding agents that scales without limits. No manual maintenance. No token waste. No agent lock-in.

### Three Layers of Memory

<table>
  <tr><th>Layer</th><th>What It Does</th><th>Command</th></tr>
  <tr><td><strong>Recall</strong></td><td>Durable memory — decisions, preferences, constraints that persist across sessions</td><td><code>squish recall</code></td></tr>
  <tr><td><strong>Sessions</strong></td><td>Searchable history — past agent runs you can inspect for evidence and context</td><td><code>squish sessions search</code></td></tr>
  <tr><td><strong>Remember</strong></td><td>Write to long-term memory — store new facts, decisions, observations</td><td><code>squish remember</code></td></tr>
</table>

### Token Cost Comparison

<table>
  <tr><th>Method</th><th>Token Usage</th><th>Cost per Session</th><th>Cross-Agent</th><th>Auto-Capture</th></tr>
  <tr><td>Paste full context</td><td>~2,000 tokens</td><td>$0.06 - $0.12</td><td>No</td><td>No</td></tr>
  <tr><td>LLM-summarized context</td><td>~500 tokens</td><td>$0.02 - $0.05</td><td>No</td><td>No</td></tr>
  <tr><td>CLAUDE.md / .cursorrules</td><td>~200 lines max</td><td>Free</td><td>No</td><td>No</td></tr>
  <tr><td><strong>Squish (local)</strong></td><td><strong>~50-200 tokens</strong></td><td><strong>$0.00</strong></td><td><strong>Yes</strong></td><td><strong>Yes</strong></td></tr>
  <tr><td><strong>Squish (Cloud)</strong></td><td><strong>~50-200 tokens</strong></td><td><strong>$0.00</strong></td><td><strong>Yes</strong></td><td><strong>Yes</strong></td></tr>
</table>

Squish retrieves only the relevant memories for the current task. The average context injection is 50-200 tokens — a fraction of what you would paste manually.

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

Close your session and open a new one. Your agent picks up where you left off — all context is restored automatically.

```bash
squish context    # See what your agent remembers
squish stats      # Check memory health
```

Works locally free. Optional cloud sync available at [squishplugin.dev](https://squishplugin.dev).

---

## Works with Every Agent

Squish works with any AI coding agent that supports MCP (Model Context Protocol) or HTTP connections. One memory server, shared across all of them.

<table>
  <tr><th>Agent</th><th>Integration Method</th><th>Notes</th></tr>
  <tr><td>Claude Code</td><td>MCP server + plugin</td><td>Auto-captures via hooks</td></tr>
  <tr><td>Codex CLI</td><td>MCP server</td><td>OpenAI's CLI agent</td></tr>
  <tr><td>GitHub Copilot CLI</td><td>MCP server</td><td>VS Code integration</td></tr>
  <tr><td>Cursor</td><td>MCP server</td><td>Editor + agent</td></tr>
  <tr><td>Gemini CLI</td><td>MCP server</td><td>Google's CLI agent</td></tr>
  <tr><td>OpenCode</td><td>MCP server + hooks</td><td>Auto-capture + MCP tools</td></tr>
  <tr><td>Cline</td><td>MCP server</td><td>VS Code extension</td></tr>
  <tr><td>Goose</td><td>MCP server</td><td>Block's agent</td></tr>
  <tr><td>Kilo Code</td><td>MCP server</td><td>VS Code extension</td></tr>
  <tr><td>Windsurf</td><td>MCP server</td><td>Codeium's editor</td></tr>
  <tr><td>Roo Code</td><td>MCP server</td><td>VS Code extension</td></tr>
  <tr><td>Claude Desktop</td><td>MCP server</td><td>Desktop app</td></tr>
  <tr><td>Aider</td><td>MCP server</td><td>Terminal pair programmer</td></tr>
  <tr><td>ChatGPT</td><td>MCP server (via Squish Cloud)</td><td>Cloud sync required</td></tr>
  <tr><td>VS Code (Copilot)</td><td>MCP server</td><td>Via MCP extension</td></tr>
</table>

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

Bring your own LLM if you want — Squish supports external embeddings and reasoning, but nothing requires it.

### Comparison

<table>
  <tr><th>Feature</th><th>Squish</th><th>Built-in (CLAUDE.md)</th><th>agentmemory</th><th>mem0</th></tr>
  <tr><td>Auto-capture</td><td>Yes (hooks)</td><td>Manual</td><td>Yes (12 hooks)</td><td>Manual API</td></tr>
  <tr><td>Local embeddings</td><td>Yes (default)</td><td>N/A</td><td>Yes</td><td>No (cloud)</td></tr>
  <tr><td>External DB required</td><td>No (SQLite)</td><td>No</td><td>Yes (iii-engine)</td><td>Yes (Qdrant)</td></tr>
  <tr><td>MCP tools</td><td>15</td><td>0</td><td>53</td><td>9</td></tr>
  <tr><td>Knowledge graph</td><td>Yes</td><td>No</td><td>Yes</td><td>No</td></tr>
  <tr><td>Cross-agent sync</td><td>Yes (Cloud)</td><td>No</td><td>No</td><td>API-based</td></tr>
  <tr><td>Price</td><td>Free local / $9/mo cloud</td><td>Free</td><td>Free</td><td>$249/mo Pro</td></tr>
  <tr><td>Setup time</td><td>30 seconds</td><td>5 minutes</td><td>15 minutes</td><td>30 minutes</td></tr>
  <tr><td>Data ownership</td><td>Full (local SQLite)</td><td>Git repo</td><td>External DB</td><td>Cloud vendor</td></tr>
</table>

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
- Separate from long-term memory — raw session history, not distilled facts

### Interfaces

- **CLI**: `squish remember`, `recall`, `inspect`, `context`, `stats`, `search`, `sessions`
- **MCP Server**: 15 tools for any MCP client — recall, health, graph, recency, maintenance
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

1. **Capture** — Filters noisy tool output, promotes what matters (decisions, constraints, preferences)
2. **Filter** — Deduplicates, resolves contradictions, scores importance
3. **Store** — Persists to SQLite/PostgreSQL with graph relationships and embeddings
4. **Retrieve** — Hybrid search combines keyword, semantic, recency, and importance scoring

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

<table>
  <tr><th>Tier</th><th>Price</th><th>Storage</th><th>Users</th><th>Features</th></tr>
  <tr><td>Local</td><td>Free</td><td>Local SQLite</td><td>1</td><td>Full memory, CLI, MCP, Web UI</td></tr>
  <tr><td>Cloud Solo</td><td>$9/mo</td><td>50 MB synced</td><td>1</td><td>Cloud sync, OAuth, dashboard</td></tr>
  <tr><td>Cloud Pro</td><td>$29/mo</td><td>250 MB synced</td><td>1</td><td>Pro features, priority support</td></tr>
  <tr><td>Team</td><td>$99/mo</td><td>1 GB shared</td><td>Up to 10</td><td>Shared workspaces, admin</td></tr>
  <tr><td>Founder Pass</td><td>$99/yr</td><td>Pro features</td><td>1</td><td>Launch-only annual pricing</td></tr>
</table>

[Sign up at squishplugin.dev](https://squishplugin.dev) — 30 seconds, no credit card needed.

> **Founder Pass** is a launch-only offer. $99/year instead of $348/year (Pro monthly).

---

## Installation Guides

- [Claude Code](docs/install/claude-code.md) — MCP server + plugin hooks for auto-capture
- [OpenCode](docs/install/opencode.md) — MCP server + hooks for OpenCode agent
- [OpenClaw](docs/install/openclaw.md) — MCP server setup for OpenClaw

### Quick install for all detected agents:

```bash
npm install -g squish-memory && squish install --all
```

Squish auto-detects which agents you have installed and configures hooks for each one.

---

## Benchmarks

Squish is tested against real-world memory retrieval tasks and synthetic benchmarks.

<table>
  <tr><th>Metric</th><th>Result</th><th>Notes</th></tr>
  <tr><td>Core Tests</td><td>9/9 passed (100%)</td><td>All memory operations</td></tr>
  <tr><td>LoCoMo Memory</td><td>65%</td><td>100 REAL questions from locomo10.json</td></tr>
  <tr><td>Throughput</td><td>39 ops/sec</td><td>With local embeddings</td></tr>
  <tr><td>Total Time</td><td>230ms</td><td>For 9 core tests</td></tr>
  <tr><td>Package Size</td><td>283 KB</td><td>Lightweight footprint</td></tr>
  <tr><td>Latency (embed)</td><td>6.6ms</td><td>Local TF-IDF embeddings</td></tr>
  <tr><td>Latency (search)</td><td>6.1ms</td><td>Hybrid retrieval</td></tr>
</table>

Full benchmark details: [docs/BENCHMARK.md](docs/BENCHMARK.md)

---

## Documentation

<table>
  <tr><th>Document</th><th>Description</th></tr>
  <tr><td><a href="docs/CLI.md">CLI Reference</a></td><td>All CLI commands and options</td></tr>
  <tr><td><a href="docs/MCP-SERVER.md">MCP Server</a></td><td>15 MCP tools and configuration</td></tr>
  <tr><td><a href="docs/ARCHITECTURE.md">Architecture</a></td><td>System design and data flow</td></tr>
  <tr><td><a href="docs/DECAY.md">Decay System</a></td><td>How memories age and lose relevance</td></tr>
  <tr><td><a href="docs/v2-scoring.md">Scoring</a></td><td>Importance and relevance scoring</td></tr>
  <tr><td><a href="docs/ENV-CONFIG.md">Environment Config</a></td><td>Environment variables and settings</td></tr>
  <tr><td><a href="docs/PLUGIN-ARCHITECTURE.md">Plugin Architecture</a></td><td>Hook system and agent integration</td></tr>
  <tr><td><a href="docs/INSTALL-QUICKSTART.md">Quick Start</a></td><td>Getting started guide</td></tr>
  <tr><td><a href="docs/agent-memory-comparison.md">Agent Comparison</a></td><td>Squish vs other memory tools</td></tr>
  <tr><td><a href="docs/CONTRIBUTING.md">Contributing</a></td><td>How to contribute</td></tr>
  <tr><td><a href="docs/RELEASE_NOTES.md">Release Notes</a></td><td>Changelog and version history</td></tr>
</table>

---

## FAQ

### What is Squish?

Squish is a local-first memory runtime for AI coding agents. It gives your agents stable orientation, durable memory, and searchable session history across runs. Think of it as a brain that persists between sessions — your agents remember decisions, constraints, preferences, and context without you having to re-explain everything. In v1.6.0, Squish also searches past agent sessions as evidence, so agents can inspect prior work instead of starting from zero.

### Does Squish require an API key?

No. Squish works locally by default with zero API keys. It uses local embeddings (TF-IDF) and SQLite storage. You can optionally configure an external LLM for enhanced reasoning, but it's not required. An API key is only needed if you want to use Squish Cloud for cross-device sync.

### How does Squish compare to mem0 or agentmemory?

Squish is the only option that works locally with zero external dependencies. mem0 requires Qdrant (a vector database) and cloud API calls. agentmemory requires iii-engine. Squish uses SQLite and local embeddings by default. See the full comparison in the [Why Squish](#why-squish) section above.

### Can I use Squish with multiple AI agents?

Yes. Squish works with any MCP-compatible agent. One memory server is shared across Claude Code, Cursor, Codex, Copilot, Gemini CLI, and any other agent that supports MCP. Memories are available to all connected agents.

### Is my data private with Squish?

Yes. In local mode, all data stays on your machine in an encrypted SQLite database. Nothing is sent to any cloud service. AES-256-GCM encryption protects sensitive memories. In cloud mode, data is encrypted in transit and at rest.

### What databases does Squish support?

Squish supports SQLite (default, local) and PostgreSQL (team mode). SQLite requires zero configuration. PostgreSQL is used for team workspaces and shared memory across multiple users.

### What is the difference between recall and sessions?

`squish recall` searches your long-term memory — distilled facts, decisions, and preferences that Squish has captured and organized. `squish sessions search` searches raw past agent runs — the actual messages, commands, and file changes from previous Claude Code, Codex, or OpenCode sessions. Recall gives you what the system decided to remember. Sessions give you the evidence.

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines on how to contribute to Squish.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://squishplugin.dev">Website</a> &middot;
  <a href="https://squishplugin.dev">Cloud Dashboard</a> &middot;
  <a href="docs/">Documentation</a> &middot;
  <a href="https://api.squishplugin.dev/.well-known/oauth-authorization-server">OAuth Metadata</a>
</p>
