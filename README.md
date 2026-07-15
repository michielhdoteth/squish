# Squish - AI Memory System for Coding Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/michielhdoteth/squish?style=social)](https://github.com/michielhdoteth/squish/stargazers)
[![Downloads](https://img.shields.io/npm/dm/squish-memory)](https://www.npmjs.com/package/squish-memory)

> **Connect your sources. Click ingest. Your AI remembers everything.**

Squish is an AI memory system for coding agents. Local-first MCP runtime with connectors, knowledge graphs, and multi-tier deployment. Free locally, paid Cloud for sync and teams.

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

## Get Started in 30 Seconds

```bash
npm install -g squish-memory && squish install --all
```

That is it. Squish installs the CLI, starts the MCP server, and configures hooks for every coding agent it finds on your machine. No API keys. No config files. No Docker.

---

## Pick Your Agent

Squish works with any MCP-compatible agent. Choose yours for a tailored quick start:

### Claude Code

```bash
npm install -g squish-memory && squish install --all
```

Squish detects Claude Code and adds plugin hooks automatically. Your next session starts with full memory context. To verify:

```bash
squish context    # See what your agent remembers
squish stats      # Check memory health
```

### Codex CLI (OpenAI)

Add Squish to your Codex MCP config:

```json
{
  "mcpServers": {
    "squish": {
      "command": "squish-mcp",
      "args": ["--http", "--port", "8767"]
    }
  }
}
```

Codex now has persistent memory across sessions. Ask it "what did we decide about the database?" and it will recall your past decisions.

### Cursor / Windsurf / Cline

Add the same MCP server block to your editor's MCP settings. One memory server, shared across all your editors and CLI agents.

### OpenCode

```bash
squish install --all
```

OpenCode gets both MCP tools and auto-capture hooks. Decisions, constraints, and preferences are captured as you work.

### Any MCP Client

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

---

## What Just Happened

After install, Squish runs in the background. Here is what it does:

1. **Captures** -- As you work, Squish watches for decisions, constraints, preferences, and context. It filters noise and stores what matters.
2. **Ingests** -- Drop files into the inbox directory. Images, audio, video, and documents are automatically extracted, described, and stored as searchable memories.
3. **Stores** -- Memories go into a local SQLite database with AES-256-GCM encryption. Nothing leaves your machine.
4. **Retrieves** -- When your agent starts a new session, Squish injects only the relevant memories (50-200 tokens, not 2,000).
5. **Decays** -- Old, low-value memories fade automatically. Your agent stays focused on what matters now.

```bash
squish remember "We chose PostgreSQL for the main datastore" --type decision
squish recall "database decisions"
squish sessions search "postgres migration"
```

---

## Works with Every Agent

| Agent | Integration | Auto-Capture |
|-------|------------|--------------|
| Claude Code | MCP server + plugin | Yes |
| Codex CLI | MCP server | No |
| Cursor | MCP server | No |
| GitHub Copilot | MCP server | No |
| Gemini CLI | MCP server | No |
| OpenCode | MCP server + hooks | Yes |
| Cline | MCP server | No |
| Goose | MCP server | No |
| Windsurf | MCP server | No |
| Roo Code | MCP server | No |
| Claude Desktop | MCP server | No |
| Aider | MCP server | No |

**One memory server. Shared across all of them.**

---

## Why Squish

Most memory tools need a second LLM for embeddings and retrieval. That means extra API costs, latency, and infrastructure you have to manage.

Squish uses local embeddings by default. Zero LLM dependency. 1-5ms latency. $0 runtime cost in local mode.

| Feature | Squish | CLAUDE.md | agentmemory | mem0 |
|---------|--------|-----------|-------------|------|
| Auto-capture | Yes (hooks) | Manual | Yes (12 hooks) | Manual API |
| Local embeddings | Yes (default) | N/A | Yes | No (cloud) |
| External DB required | No (SQLite) | No | Yes (iii-engine) | Yes (Qdrant) |
| MCP tools | 7 | 0 | 53 | 9 |
| Knowledge graph | Yes | No | Yes | No |
| Cross-agent sync | Yes (Cloud) | No | No | API-based |
| Price | Free local / $9/mo cloud | Free | Free | $249/mo Pro |
| Setup time | 30 seconds | 5 minutes | 15 minutes | 30 minutes |
| Data ownership | Full (local SQLite) | Git repo | External DB | Cloud vendor |

---

## Core Concepts

| Concept | What It Is |
|---------|-----------|
| **Recall** | Durable memory -- decisions, preferences, constraints |
| **Sessions** | Evidence from past agent runs |
| **Pinned** | Stable facts that do not decay |
| **Beliefs** | Passive model of user/project |
| **Strategies** | Active operating rules |
| **Media Memories** | Ingested images, audio, video, and documents with extracted text |
| **LLM Consolidation** | Cross-connection finding via LLM-powered knowledge analysis |
| **Decay** | Stale weak traces fade automatically |
| **Graph** | Reinforced relationships from usage |

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

### Multimodal Memory

- Ingest images, audio, video, and documents into searchable memories
- Automatic text extraction via OCR, speech-to-text, and document parsing
- 27+ supported file types: JPEG, PNG, GIF, WebP, TIFF, HEIC, MP3, WAV, OGG, FLAC, M4A, MP4, WebM, AVI, MOV, MKV, PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, JSON, XML, YAML, HTML, RTF
- File watcher for automatic inbox monitoring and ingestion
- LLM-generated descriptions for each ingested file
- Cross-connection finding via LLM consolidation across memory clusters

### Session Search

- Search previous Claude Code, Codex, and OpenCode sessions
- Find related sessions by project path or file overlap
- Inspect past decisions, errors, and commands as evidence
- Separate from long-term memory -- raw session history, not distilled facts

### Interfaces

- **CLI**: `squish remember`, `recall`, `inspect`, `context`, `stats`, `search`, `sessions`
- **MCP Server**: 7 tools for any MCP client -- recall, graph, context, multimodal ingestion, LLM consolidation
- **Web UI**: Local dashboard at `localhost:37777` for visualizing memories
- **Cloud Dashboard**: Paid analytics and management at [squishplugin.dev](https://squishplugin.dev)

### Storage

- SQLite (local, default) or Squish Cloud team workspaces
- Hybrid retrieval: keyword + semantic similarity with RRF fusion
- AES-256-GCM encryption for sensitive memories
- Places routing: organize memories by project, feature, or context
- Full-text search with BM25 ranking
- Vector search with TF-IDF embeddings (768-dimensional)

---

## Architecture

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBBWyJBZ2VudCBBY3Rpb24iXSAtLT4gQlsiMS4gQ2FwdHVyZSJdCiAgICBCIC0tPiBCMVsiRmlsdGVyIG5vaXN5IG91dHB1dCJdCiAgICBCIC0tPiBCMlsiUHJvbW90ZSBkZWNpc2lvbnMsXG5jb25zdHJhaW50cywgcHJlZmVyZW5jZXMiXQogICAgQjEgLS0-IENbIjIuIFN0b3JlIl0KICAgIEIyIC0tPiBDCiAgICBDIC0tPiBDMVsiU1FMaXRlIC8gUG9zdGdyZVNRTCJdCiAgICBDIC0tPiBDMlsiRW1iZWRkaW5nc1xuKGxvY2FsIFRGLUlERikiXQogICAgQyAtLT4gQzNbIktub3dsZWRnZSBncmFwaCBlZGdlcyJdCiAgICBDIC0tPiBDNFsiUGxhY2VzIHJvdXRpbmciXQogICAgQzEgLS0-IERbIjMuIFJldHJpZXZlIl0KICAgIEMyIC0tPiBECiAgICBDMyAtLT4gRAogICAgQzQgLS0-IEQKICAgIEQgLS0-IEQxWyJLZXl3b3JkIHNlYXJjaCAoQk0yNSkiXQogICAgRCAtLT4gRDJbIlNlbWFudGljIHNlYXJjaFxuKGNvc2luZSBzaW1pbGFyaXR5KSJdCiAgICBEIC0tPiBEM1siUmVjZW5jeSB3ZWlnaHRpbmciXQogICAgRCAtLT4gRDRbIlJSRiBmdXNpb24gc2NvcmluZyJdCiAgICBEMSAtLT4gRVsiNC4gQ29udGV4dCJdCiAgICBEMiAtLT4gRQogICAgRDMgLS0-IEUKICAgIEQ0IC0tPiBFCiAgICBFIC0tPiBFMVsiSW5qZWN0IHJlbGV2YW50IG1lbW9yaWVzXG5pbnRvIGFnZW50IGNvbnRleHQiXQogICAgRTEgLS0-IEUyWyI1MC0yMDAgdG9rZW5zIGF2ZXJhZ2UiXQogICAgRTEgLS0-IEUzWyJBdXRvLWRlY2F5IG9sZC9sb3ctdmFsdWVcbm1lbW9yaWVzIl0KCiAgICBjbGFzc0RlZiBjYXB0dXJlIGZpbGw6IzRhOWVmZixzdHJva2U6IzJkN2RkMixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBzdG9yZSBmaWxsOiM3YzNhZWQsc3Ryb2tlOiM1YjIxYjYsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgcmV0cmlldmUgZmlsbDojMDU5NjY5LHN0cm9rZTojMDQ3ODU3LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGNvbnRleHQgZmlsbDojZDk3NzA2LHN0cm9rZTojYjQ1MzA5LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGRldGFpbCBmaWxsOiNmM2Y0ZjYsc3Ryb2tlOiM5Y2EzYWYsY29sb3I6IzM3NDE1MQoKICAgIGNsYXNzIEEgY2FwdHVyZQogICAgY2xhc3MgQixCMSxCMiBjYXB0dXJlCiAgICBjbGFzcyBDLEMxLEMyLEMzLEM0IHN0b3JlCiAgICBjbGFzcyBELEQxLEQyLEQzLEQ0IHJldHJpZXZlCiAgICBjbGFzcyBFLEUxLEUyLEUzIGNvbnRleHQK" alt="Architecture" width="780" />
</p>

### Three-Layer Memory Model

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IExSCiAgICBzdWJncmFwaCBSRUNBTExbIlJFQ0FMTCDigJQgZHVyYWJsZSJdCiAgICAgICAgUjFbIkRlY2lzaW9ucyJdCiAgICAgICAgUjJbIlByZWZlcmVuY2VzIl0KICAgICAgICBSM1siQ29uc3RyYWludHMiXQogICAgICAgIFI0WyJCZWxpZWZzIl0KICAgIGVuZAogICAgc3ViZ3JhcGggU0VTU0lPTlNbIlNFU1NJT05TIOKAlCBldmlkZW5jZSJdCiAgICAgICAgUzFbIlBhc3QgYWdlbnQgcnVucyJdCiAgICAgICAgUzJbIlNlYXJjaGFibGUiXQogICAgICAgIFMzWyJSYXcgaGlzdG9yeSJdCiAgICAgICAgUzRbIlJlbGF0ZWQgcmVwb3MiXQogICAgZW5kCiAgICBzdWJncmFwaCBSRU1FTUJFUlsiUkVNRU1CRVIg4oCUIHdyaXRlIl0KICAgICAgICBNMVsiU3RvcmUgbmV3IGZhY3RzIl0KICAgICAgICBNMlsiQXV0by1jbGFzc2lmeSJdCiAgICAgICAgTTNbIkdyYXBoIHVwZGF0ZSJdCiAgICAgICAgTTRbIlBsYWNlIHJvdXRpbmciXQogICAgZW5kCiAgICBSRUNBTEwgLS0-IHwic3F1aXNoIHJlY2FsbCJ8IENMSTFbIkNMSSAvIE1DUCJdCiAgICBTRVNTSU9OUyAtLT4gfCJzcXVpc2ggc2Vzc2lvbnMgc2VhcmNoInwgQ0xJMlsiQ0xJIC8gTUNQIl0KICAgIFJFTUVNQkVSIC0tPiB8InNxdWlzaCByZW1lbWJlciJ8IENMSTNbIkNMSSAvIE1DUCJdCgogICAgY2xhc3NEZWYgcmVjYWxsIGZpbGw6IzRhOWVmZixzdHJva2U6IzJkN2RkMixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBzZXNzaW9ucyBmaWxsOiM3YzNhZWQsc3Ryb2tlOiM1YjIxYjYsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgcmVtZW1iZXIgZmlsbDojMDU5NjY5LHN0cm9rZTojMDQ3ODU3LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGNsaSBmaWxsOiNmM2Y0ZjYsc3Ryb2tlOiM5Y2EzYWYsY29sb3I6IzM3NDE1MQoKICAgIGNsYXNzIFIxLFIyLFIzLFI0IHJlY2FsbAogICAgY2xhc3MgUzEsUzIsUzMsUzQgc2Vzc2lvbnMKICAgIGNsYXNzIE0xLE0yLE0zLE00IHJlbWVtYmVyCiAgICBjbGFzcyBDTEkxLENMSTIsQ0xJMyBjbGkK" alt="Three-Layer Memory Model" width="780" />
</p>

---

## Connectors

Squish connects to your existing tools and ingests context automatically:

| Connector | What It Ingests |
|-----------|----------------|
| Google Drive | Documents, sheets, slides, and files |
| GitHub | Issues, PRs, discussions, code context, and repo metadata |
| Slack | Messages, threads, channel context, and decisions |
| Notion | Pages, databases, docs, and wikis |

Connectors are available on Cloud tiers. Install with:

```bash
squish connect google-drive
squish connect github
squish connect slack
squish connect notion
```

---

## Squish Cloud

Persistent memory across ChatGPT, Claude Desktop, Claude Code, and local agents. One account, synchronized everywhere.

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBDR1siQ2hhdEdQVFxuT0F1dGggMi4xIl0gLS0-IEFQSVsiU3F1aXNoIENsb3VkIEFQSSJdCiAgICBDRFsiQ2xhdWRlIERlc2t0b3Bcbk9BdXRoIDIuMSJdIC0tPiBBUEkKICAgIENDWyJDbGF1ZGUgQ29kZVxuU3RyZWFtYWJsZSBIVFRQIl0gLS0-IEFQSQogICAgTEFbIkxvY2FsIEFnZW50c1xuTUNQIC8gQ0xJIl0gLS0-IEFQSQogICAgQVBJIC0tPiBEQlsoIlBvc3RncmVTUUwgK1xuRW5jcnlwdGVkIFN0b3JhZ2UiKV0KICAgIERCIC0tPiBEYXNoYm9hcmRbIkFkbWluIERhc2hib2FyZFxuJiBBbmFseXRpY3MiXQoKICAgIGNsYXNzRGVmIGNsaWVudCBmaWxsOiM0YTllZmYsc3Ryb2tlOiMyZDdkZDIsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgYXBpIGZpbGw6IzdjM2FlZCxzdHJva2U6IzViMjFiNixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBkYiBmaWxsOiMwNTk2Njksc3Ryb2tlOiMwNDc4NTcsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgZGFzaCBmaWxsOiNkOTc3MDYsc3Ryb2tlOiNiNDUzMDksY29sb3I6I2ZmZgoKICAgIGNsYXNzIENHLENELENDLExBIGNsaWVudAogICAgY2xhc3MgQVBJIGFwaQogICAgY2xhc3MgREIgZGIKICAgIGNsYXNzIERhc2hib2FyZCBkYXNoCg" alt="Squish Cloud Architecture" width="600" />
</p>

**Cloud features:** OAuth 2.1 + PKCE login, cross-platform sync, team workspaces, admin dashboard, priority support.

### Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Local** | Free forever | SQLite, 7 MCP tools, offline, knowledge graph, multimodal ingestion |
| **Cloud Solo** | $9/mo | Everything in Local + cloud sync, 1 connector, 10K requests/mo |
| **Cloud Pro** | $29/mo | Cross-tool sync, 3 connectors, 50K requests/mo, shared workspaces |
| **Cloud Team** | $99/mo | Unlimited seats, all connectors, 200K requests/mo, RBAC, audit logs |

[Sign up at squishplugin.dev](https://squishplugin.dev) -- 30 seconds, no credit card needed.

---

## Benchmarks

Squish is tested against real-world memory retrieval tasks and synthetic benchmarks.

| Metric | Result | Notes |
|--------|--------|-------|
| Core Tests | 9/9 passed (100%) | All memory operations |
| LoCoMo Memory | 65% | 100 REAL questions from locomo10.json |
| Throughput | 39 ops/sec | With local embeddings |
| Total Time | 230ms | For 9 core tests |
| Package Size | 674 KB | Lightweight footprint |
| Latency (embed) | 6.6ms | Local TF-IDF embeddings |
| Latency (search) | 6.1ms | Hybrid retrieval |

Full benchmark details: [docs/BENCHMARK.md](docs/BENCHMARK.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLI Reference](docs/CLI.md) | All CLI commands and options |
| [MCP Server](docs/MCP-SERVER.md) | 7 MCP tools and configuration |
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

Squish is a local-first memory runtime for AI coding agents. It gives your agents stable orientation, durable memory, and searchable session history across runs. Think of it as a brain that persists between sessions -- your agents remember decisions, constraints, preferences, and context without you having to re-explain everything.

### Does Squish require an API key?

No. Squish works locally by default with zero API keys. It uses local embeddings (TF-IDF) and SQLite storage. You can optionally configure an external LLM for enhanced reasoning, but it is not required. An API key is only needed if you want to use the paid Squish Cloud for cross-device sync.

### How does Squish compare to mem0 or agentmemory?

Squish is the only option that works locally with zero external dependencies. mem0 requires Qdrant (a vector database) and cloud API calls. agentmemory requires iii-engine. Squish uses SQLite and local embeddings by default. See the full comparison in the [Why Squish](#why-squish) section above.

### Can I use Squish with multiple AI agents?

Yes. Squish works with any MCP-compatible agent. One memory server is shared across Claude Code, Cursor, Codex, Copilot, Gemini CLI, and any other agent that supports MCP. Memories are available to all connected agents.

### Is my data private with Squish?

Yes. In local mode, all data stays on your machine in an encrypted SQLite database. Nothing is sent to any cloud service. AES-256-GCM encryption protects sensitive memories. In cloud mode, data is encrypted in transit and at rest.

### What is the difference between recall and sessions?

`squish recall` searches your long-term memory -- distilled facts, decisions, and preferences that Squish has captured and organized. `squish sessions search` searches raw past agent runs -- the actual messages, commands, and file changes from previous Claude Code, Codex, or OpenCode sessions. Recall gives you what the system decided to remember. Sessions give you the evidence.

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines on how to contribute to Squish.

---

## License

MIT -- see [LICENSE](LICENSE) for details.

---

## Star the Repo

If Squish helps your project, consider starring the repo. It helps other developers find memory tools for their AI agents.

<p align="center">
  <a href="https://github.com/michielhdoteth/squish">
    <img src="https://img.shields.io/github/stars/michielhdoteth/squish?style=social&label=Star" alt="Star Squish on GitHub" />
  </a>
</p>

---

<p align="center">
  <a href="https://squishplugin.dev">Website</a> &middot;
  <a href="https://squishplugin.dev">Cloud Dashboard</a> &middot;
  <a href="https://docs.squishplugin.dev">Documentation</a> &middot;
  <a href="https://github.com/michielhdoteth/squish">GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/squish-memory">npm</a>
</p>
