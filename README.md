# Squish -- One command. Memory everywhere.

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dt/squish-memory?color=green)](https://www.npmjs.com/package/squish-memory)

> One command. Zero config. Works with Claude Code, ChatGPT, Codex, Cursor, and every MCP-compatible agent.

```bash
npm install -g squish-memory && squish install --all
```

That's it. Memory that persists across sessions and across agents. No API keys. No LLM needed.

```bash
squish remember "We chose PostgreSQL for team mode" --type decision
squish recall "project decisions"
```

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

## The problem: agents forget everything

Every time you start a new session, your AI agent starts from zero. That architecture decision from last week, the config you spent an hour debugging, the preference you mentioned yesterday -- gone.

Squish is memory that persists between sessions. Across agents. Across machines. One command to install, zero config to run.

---

## How it works

1. **Install** -- `npm install -g squish-memory && squish install --all` (30 seconds)
2. **Work** -- Squish auto-captures decisions, constraints, and context
3. **Restart** -- Any connected agent picks up where you left off

Use locally free. Sync with Squish Cloud when you need cross-machine memory.

---

## Why Squish

Most memory tools need a second LLM for embeddings and retrieval. That means extra API costs, latency, and infrastructure.

**Squish uses local embeddings by default. Zero LLM dependency.** 1-5ms latency, $0 runtime in local mode.

---

## Features

Squish works with **any MCP-compatible agent** -- Claude Code, Cursor, OpenCode, Cline, VS Code, Windsurf, Goose, Gemini CLI, Aider, ChatGPT, and more.

**Memory intelligence:**
- Auto-captures decisions, constraints, and preferences as you work
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
- Hybrid retrieval: keyword + semantic similarity
- AES-256-GCM encryption for sensitive memories
- Places routing: organize memories by context

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
| Founder Pass | $99/yr | Pro features | 1 |

[Sign up at squishplugin.dev](https://squishplugin.dev) -- 30 seconds, no credit card needed.

> **Founder Pass** is a launch-only offer. $99/year instead of $348/year (Pro monthly).

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
Agent Action -> [Filter & Store] -> SQLite/PostgreSQL
                  +                         +
            [Memory Pipeline]        [Hybrid Retrieval]
           auto-capture, dedup,    keyword + semantic search
           graph relationships     with RRF fusion
```

Two-tier memory pipeline:
1. **Capture** filters noisy tool output and promotes what matters -- decisions, constraints, preferences
2. **Retrieval** combines keyword and semantic search to find the right context when you need it
3. **Graph** connects related memories across sessions for smarter recall
4. **Places** route memories into buckets so retrieval stays focused

---

## Links

- [Website & Cloud Dashboard](https://squishplugin.dev)
- [Documentation](docs/)
- [OAuth Metadata](https://api.squishplugin.dev/.well-known/oauth-authorization-server)

## License

MIT
