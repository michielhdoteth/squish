# Squish -- AI agents forget. Squish makes them remember.

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![LoCoMo Score](https://img.shields.io/badge/LoCoMo-65%25-success)](docs/BENCHMARK.md)
[![Package Size](https://img.shields.io/badge/size-283_KB_gzipped-blueviolet)](https://www.npmjs.com/package/squish-memory)
[![npm downloads](https://img.shields.io/npm/dt/squish-memory?color=green)](https://www.npmjs.com/package/squish-memory)
[![GitHub stars](https://img.shields.io/github/stars/michielhdoteth/squish)](https://github.com/michielhdoteth/squish)

**Without Squish:** Session ends. Context gone. You explain everything again.

**With Squish:** Restart the agent. Continue working.

283KB. 1-5ms retrieval. Works with or without LLM. $0 runtime. Runs local.

---

## Install (30 seconds)

```bash
npm install -g squish-memory && squish install --all
```

Zero config. Zero API keys. Zero cloud dependency (unless you want sync).

```bash
# Show current project context
squish context --json

# Save something explicitly
squish remember "We chose PostgreSQL for team mode" --type decision

# See what the agent knows about a topic
squish recall "project decisions"
```

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

## Performance

| Metric | Result |
|--------|--------|
| Embedding Latency | **1-5ms** |
| Query Latency | **1-20ms** |
| Throughput | **943 ops/sec** |
| Package Size | **283 KB gzipped** |
| Local Runtime Cost | **$0** |

*Full benchmarks at [docs/BENCHMARK.md](docs/BENCHMARK.md)*

---

## Why Squish (not another memory system)

Most memory tools need a second LLM for embeddings and retrieval. That means:
- Extra API costs ($10-100+/mo per agent)
- More latency (500ms+ per LLM call)
- More complexity (API keys, rate limits, downtime)

**Squish uses local embeddings by default. No forced LLM dependency.**
- 1-5ms embedding latency (not 500ms+)
- $0 runtime cost in local mode
- Optional LLM for enhanced extraction and Cloud features
- 283KB package (30-100x smaller than alternatives)

| Feature | Most Memory Tools | Squish |
|---------|------------------|--------|
| Embedding latency | 200-1000ms | **1-5ms** |
| Local mode cost | $10-100+/mo | **$0** |
| LLM required | Yes | **Optional** |
| Package size | 50MB-2GB | **283KB** |
| MCP server | Sometimes | **Built-in (15 tools)** |
| Cloud sync | Enterprise-only | **$9/mo** |

---

## What you get

Squish is a memory runtime that works with **any MCP-compatible agent** -- Claude Code, Cursor, OpenCode, Cline, VS Code, Windsurf, Goose, Gemini CLI, Aider, ChatGPT, and more.

**Memory intelligence:**
- Auto-captures durable signal without the agent remembering to save
- Derives beliefs (decisions, constraints, preferences) from captured memories
- Restores relevant context when an agent restarts
- Handles contradictions and temporal facts with expiration
- Graph-boosted retrieval across sessions

**Interfaces:**
- **CLI**: `squish remember`, `recall`, `inspect`, `context`, `stats`
- **MCP Server**: 15 tools for any MCP client
- **Web UI**: Local dashboard at `localhost:37777`
- **Cloud Dashboard**: Analytics and management at [squishplugin.dev](https://squishplugin.dev)

**Storage:**
- SQLite (local, default) or PostgreSQL (team mode)
- Hybrid retrieval: BM25 keyword + semantic similarity (RRF fusion)
- AES-256-GCM encryption for sensitive memories
- Places routing: WIP, Sandbox, Board, Ref buckets

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

| Tier | Price | Storage | Users |
|------|-------|---------|-------|
| Local | Free | Local SQLite | 1 |
| Cloud Solo | $9/mo | 50 MB synced | 1 |
| Cloud Pro | $29/mo | 250 MB synced | 1 |
| Team | $99/mo | 1 GB shared | Up to 10 |

[Sign up at squishplugin.dev](https://squishplugin.dev) -- 30 seconds, no credit card needed.

---

## Quick Start (Cloud)

```bash
npm install -g squish-memory
squish cloud login        # Opens browser for OAuth -- done
```

Then add to any MCP client:

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

## Architecture (brief)

```
Agent Action -> [Signal Distillation] -> Discard noise or store durable
                                               |
                                     [Write Gate + Places Routing]
                                               |
                          [SQLite/PostgreSQL + Graph Enrichment]
                                               |
                                     [Hybrid Retrieval: BM25+Semantic]
```

Two-tier memory pipeline:
1. **Signal distillation** filters noisy tool output, promotes durable signal
2. **Hybrid retrieval** combines keyword (BM25) and semantic (embedding) search with Reciprocal Rank Fusion
3. **Belief derivation** turns memories into decisions, constraints, preferences
4. **Places** route memories into spatial buckets for noise-constrained retrieval

---

## Links

- [Website & Cloud Dashboard](https://squishplugin.dev)
- [Documentation](docs/)
- [Benchmarks](docs/BENCHMARK.md)
- [MCP PR #6740 (awesome-mcp-servers)](https://github.com/punkpeye/awesome-mcp-servers/pull/6740)
- [OAuth Metadata](https://api.squishplugin.dev/.well-known/oauth-authorization-server)

## License

MIT
