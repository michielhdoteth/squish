# Squish - One command. Memory everywhere.

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/michielhdoteth/squish?style=social)](https://github.com/michielhdoteth/squish/stargazers)

> Local-first memory runtime for Claude Code, Codex, ChatGPT, MCP workflows, and local agents.
>
> Works locally for free. Squish Cloud is available for cross-device sync.

**Squish gives agents stable orientation, durable memory, and searchable session history across runs.** Use it locally with no cloud dependency, or connect Squish Cloud for sync across machines.

```bash
npm i -g squish-memory && squish install --all
```

Squish provides AI agent memory that persists between sessions, across agents, and across machines. It is a free local-first MCP server with built-in embeddings, a knowledge graph, and hybrid retrieval. Squish Cloud is the paid managed tier for sync, dashboard, and team features.

Cloud pricing:

- Local Free: $0
- Cloud Solo: $9/mo
- Cloud Pro: $29/mo
- Founder Pass: $49-$99

<p align="center">
  <img src="assets/demo/squish-demo.gif" width="780" alt="Squish Demo" />
</p>

---

### Core Concepts

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Concept</th>
      <th style="padding: 10px 14px; text-align: left;">What It Is</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><strong>Recall</strong></td>
      <td style="padding: 10px 14px;">Durable memory — decisions, preferences, constraints</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><strong>Sessions</strong></td>
      <td style="padding: 10px 14px;">Evidence from past agent runs</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><strong>Pinned</strong></td>
      <td style="padding: 10px 14px;">Stable facts that do not decay</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><strong>Beliefs</strong></td>
      <td style="padding: 10px 14px;">Passive model of user/project</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><strong>Strategies</strong></td>
      <td style="padding: 10px 14px;">Active operating rules</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><strong>Decay</strong></td>
      <td style="padding: 10px 14px;">Stale weak traces fade automatically</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;"><strong>Graph</strong></td>
      <td style="padding: 10px 14px;">Reinforced relationships from usage</td>
    </tr>
  </tbody>
</table>

---

## The Problem: Agents Forget Everything

Every AI coding agent starts from zero when a new session begins. The architecture decision from last week, the config you spent an hour debugging, the preference you mentioned yesterday — gone.

Built-in memory files like CLAUDE.md and .cursorrules help, but they have hard limits. They cap out around 200 lines, require manual curation, and do not work across agents. You end up copy-pasting the same context into every tool.

Squish gives you persistent memory for coding agents that scales without limits. No manual maintenance. No token waste. No agent lock-in.

### Three Layers of Memory

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Layer</th>
      <th style="padding: 10px 14px; text-align: left;">What It Does</th>
      <th style="padding: 10px 14px; text-align: left;">Command</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><strong>Recall</strong></td>
      <td style="padding: 10px 14px;">Durable memory — decisions, preferences, constraints that persist across sessions</td>
      <td style="padding: 10px 14px;"><code>squish recall</code></td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><strong>Sessions</strong></td>
      <td style="padding: 10px 14px;">Searchable history — past agent runs you can inspect for evidence and context</td>
      <td style="padding: 10px 14px;"><code>squish sessions search</code></td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;"><strong>Remember</strong></td>
      <td style="padding: 10px 14px;">Write to long-term memory — store new facts, decisions, observations</td>
      <td style="padding: 10px 14px;"><code>squish remember</code></td>
    </tr>
  </tbody>
</table>

### Token Cost Comparison

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Method</th>
      <th style="padding: 10px 14px; text-align: left;">Token Usage</th>
      <th style="padding: 10px 14px; text-align: left;">Cost per Session</th>
      <th style="padding: 10px 14px; text-align: left;">Cross-Agent</th>
      <th style="padding: 10px 14px; text-align: left;">Auto-Capture</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Paste full context</td>
      <td style="padding: 10px 14px;">~2,000 tokens</td>
      <td style="padding: 10px 14px;">$0.06 - $0.12</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">No</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">LLM-summarized context</td>
      <td style="padding: 10px 14px;">~500 tokens</td>
      <td style="padding: 10px 14px;">$0.02 - $0.05</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">No</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">CLAUDE.md / .cursorrules</td>
      <td style="padding: 10px 14px;">~200 lines max</td>
      <td style="padding: 10px 14px;">Free</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">No</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><strong>Squish (local)</strong></td>
      <td style="padding: 10px 14px;"><strong>~50-200 tokens</strong></td>
      <td style="padding: 10px 14px;"><strong>$0.00</strong></td>
      <td style="padding: 10px 14px;"><strong>Yes</strong></td>
      <td style="padding: 10px 14px;"><strong>Yes</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;"><strong>Squish (Cloud)</strong></td>
      <td style="padding: 10px 14px;"><strong>~50-200 tokens</strong></td>
      <td style="padding: 10px 14px;"><strong>$0.00</strong></td>
      <td style="padding: 10px 14px;"><strong>Yes</strong></td>
      <td style="padding: 10px 14px;"><strong>Yes</strong></td>
    </tr>
  </tbody>
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
squish remember "We chose PostgreSQL for Squish Cloud team mode" --type decision
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

Works locally free. Paid Squish Cloud is available at [squishplugin.dev](https://squishplugin.dev) for sync, dashboard, and team features.

---

## Works with Every Agent

Squish works with any AI coding agent that supports MCP (Model Context Protocol) or HTTP connections. One memory server, shared across all of them.

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Agent</th>
      <th style="padding: 10px 14px; text-align: left;">Integration Method</th>
      <th style="padding: 10px 14px; text-align: left;">Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Claude Code</td>
      <td style="padding: 10px 14px;">MCP server + plugin</td>
      <td style="padding: 10px 14px;">Auto-captures via hooks</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Codex CLI</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">OpenAI's CLI agent</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">GitHub Copilot CLI</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">VS Code integration</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Cursor</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Editor + agent</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Gemini CLI</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Google's CLI agent</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">OpenCode</td>
      <td style="padding: 10px 14px;">MCP server + hooks</td>
      <td style="padding: 10px 14px;">Auto-capture + MCP tools</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Cline</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">VS Code extension</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Goose</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Block's agent</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Kilo Code</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">VS Code extension</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Windsurf</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Codeium's editor</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Roo Code</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">VS Code extension</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Claude Desktop</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Desktop app</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Aider</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Terminal pair programmer</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">ChatGPT</td>
      <td style="padding: 10px 14px;">MCP server (via Squish Cloud)</td>
      <td style="padding: 10px 14px;">Cloud sync required</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;">VS Code (Copilot)</td>
      <td style="padding: 10px 14px;">MCP server</td>
      <td style="padding: 10px 14px;">Via MCP extension</td>
    </tr>
  </tbody>
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
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Feature</th>
      <th style="padding: 10px 14px; text-align: left;">Squish</th>
      <th style="padding: 10px 14px; text-align: left;">Built-in (CLAUDE.md)</th>
      <th style="padding: 10px 14px; text-align: left;">agentmemory</th>
      <th style="padding: 10px 14px; text-align: left;">mem0</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Auto-capture</td>
      <td style="padding: 10px 14px;">Yes (hooks)</td>
      <td style="padding: 10px 14px;">Manual</td>
      <td style="padding: 10px 14px;">Yes (12 hooks)</td>
      <td style="padding: 10px 14px;">Manual API</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Local embeddings</td>
      <td style="padding: 10px 14px;">Yes (default)</td>
      <td style="padding: 10px 14px;">N/A</td>
      <td style="padding: 10px 14px;">Yes</td>
      <td style="padding: 10px 14px;">No (cloud)</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">External DB required</td>
      <td style="padding: 10px 14px;">No (SQLite)</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">Yes (iii-engine)</td>
      <td style="padding: 10px 14px;">Yes (Qdrant)</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">MCP tools</td>
      <td style="padding: 10px 14px;">15</td>
      <td style="padding: 10px 14px;">0</td>
      <td style="padding: 10px 14px;">53</td>
      <td style="padding: 10px 14px;">9</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Knowledge graph</td>
      <td style="padding: 10px 14px;">Yes</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">Yes</td>
      <td style="padding: 10px 14px;">No</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Cross-agent sync</td>
      <td style="padding: 10px 14px;">Yes (Cloud)</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">No</td>
      <td style="padding: 10px 14px;">API-based</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Price</td>
      <td style="padding: 10px 14px;">Free local / $9/mo cloud</td>
      <td style="padding: 10px 14px;">Free</td>
      <td style="padding: 10px 14px;">Free</td>
      <td style="padding: 10px 14px;">$249/mo Pro</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Setup time</td>
      <td style="padding: 10px 14px;">30 seconds</td>
      <td style="padding: 10px 14px;">5 minutes</td>
      <td style="padding: 10px 14px;">15 minutes</td>
      <td style="padding: 10px 14px;">30 minutes</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;">Data ownership</td>
      <td style="padding: 10px 14px;">Full (local SQLite)</td>
      <td style="padding: 10px 14px;">Git repo</td>
      <td style="padding: 10px 14px;">External DB</td>
      <td style="padding: 10px 14px;">Cloud vendor</td>
    </tr>
  </tbody>
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
- **Cloud Dashboard**: Paid analytics and management at [squishplugin.dev](https://squishplugin.dev)

### Storage

- SQLite (local, default) or Squish Cloud team workspaces
- Hybrid retrieval: keyword + semantic similarity with RRF fusion
- AES-256-GCM encryption for sensitive memories
- Places routing: organize memories by project, feature, or context
- Full-text search with BM25 ranking
- Vector search with TF-IDF embeddings (768-dimensional)

### Memory Pipeline

Squish uses a 4-stage pipeline to process memories:

1. **Capture** — Filters noisy tool output, keeps new memories private-first, and suggests what should be promoted into project/team/company scopes
2. **Filter** — Deduplicates, resolves contradictions, scores importance
3. **Store** — Persists to SQLite/PostgreSQL with graph relationships and embeddings
4. **Retrieve** — Hybrid search combines keyword, semantic, recency, and importance scoring

---

## Architecture

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBBWyJBZ2VudCBBY3Rpb24iXSAtLT4gQlsiMS4gQ2FwdHVyZSJdCiAgICBCIC0tPiBCMVsiRmlsdGVyIG5vaXN5IG91dHB1dCJdCiAgICBCIC0tPiBCMlsiUHJvbW90ZSBkZWNpc2lvbnMsXG5jb25zdHJhaW50cywgcHJlZmVyZW5jZXMiXQogICAgQjEgLS0-IENbIjIuIFN0b3JlIl0KICAgIEIyIC0tPiBDCiAgICBDIC0tPiBDMVsiU1FMaXRlIC8gUG9zdGdyZVNRTCJdCiAgICBDIC0tPiBDMlsiRW1iZWRkaW5nc1xuKGxvY2FsIFRGLUlERikiXQogICAgQyAtLT4gQzNbIktub3dsZWRnZSBncmFwaCBlZGdlcyJdCiAgICBDIC0tPiBDNFsiUGxhY2VzIHJvdXRpbmciXQogICAgQzEgLS0-IERbIjMuIFJldHJpZXZlIl0KICAgIEMyIC0tPiBECiAgICBDMyAtLT4gRAogICAgQzQgLS0-IEQKICAgIEQgLS0-IEQxWyJLZXl3b3JkIHNlYXJjaCAoQk0yNSkiXQogICAgRCAtLT4gRDJbIlNlbWFudGljIHNlYXJjaFxuKGNvc2luZSBzaW1pbGFyaXR5KSJdCiAgICBEIC0tPiBEM1siUmVjZW5jeSB3ZWlnaHRpbmciXQogICAgRCAtLT4gRDRbIlJSRiBmdXNpb24gc2NvcmluZyJdCiAgICBEMSAtLT4gRVsiNC4gQ29udGV4dCJdCiAgICBEMiAtLT4gRQogICAgRDMgLS0-IEUKICAgIEQ0IC0tPiBFCiAgICBFIC0tPiBFMVsiSW5qZWN0IHJlbGV2YW50IG1lbW9yaWVzXG5pbnRvIGFnZW50IGNvbnRleHQiXQogICAgRTEgLS0-IEUyWyI1MC0yMDAgdG9rZW5zIGF2ZXJhZ2UiXQogICAgRTEgLS0-IEUzWyJBdXRvLWRlY2F5IG9sZC9sb3ctdmFsdWVcbm1lbW9yaWVzIl0KCiAgICBjbGFzc0RlZiBjYXB0dXJlIGZpbGw6IzRhOWVmZixzdHJva2U6IzJkN2RkMixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBzdG9yZSBmaWxsOiM3YzNhZWQsc3Ryb2tlOiM1YjIxYjYsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgcmV0cmlldmUgZmlsbDojMDU5NjY5LHN0cm9rZTojMDQ3ODU3LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGNvbnRleHQgZmlsbDojZDk3NzA2LHN0cm9rZTojYjQ1MzA5LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGRldGFpbCBmaWxsOiNmM2Y0ZjYsc3Ryb2tlOiM5Y2EzYWYsY29sb3I6IzM3NDE1MQoKICAgIGNsYXNzIEEgY2FwdHVyZQogICAgY2xhc3MgQixCMSxCMiBjYXB0dXJlCiAgICBjbGFzcyBDLEMxLEMyLEMzLEM0IHN0b3JlCiAgICBjbGFzcyBELEQxLEQyLEQzLEQ0IHJldHJpZXZlCiAgICBjbGFzcyBFLEUxLEUyLEUzIGNvbnRleHQK" alt="Architecture" width="780" />
</p>

### Three-Layer Memory Model

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IExSCiAgICBzdWJncmFwaCBSRUNBTExbIlJFQ0FMTCDigJQgZHVyYWJsZSJdCiAgICAgICAgUjFbIkRlY2lzaW9ucyJdCiAgICAgICAgUjJbIlByZWZlcmVuY2VzIl0KICAgICAgICBSM1siQ29uc3RyYWludHMiXQogICAgICAgIFI0WyJCZWxpZWZzIl0KICAgIGVuZAogICAgc3ViZ3JhcGggU0VTU0lPTlNbIlNFU1NJT05TIOKAlCBldmlkZW5jZSJdCiAgICAgICAgUzFbIlBhc3QgYWdlbnQgcnVucyJdCiAgICAgICAgUzJbIlNlYXJjaGFibGUiXQogICAgICAgIFMzWyJSYXcgaGlzdG9yeSJdCiAgICAgICAgUzRbIlJlbGF0ZWQgcmVwb3MiXQogICAgZW5kCiAgICBzdWJncmFwaCBSRU1FTUJFUlsiUkVNRU1CRVIg4oCUIHdyaXRlIl0KICAgICAgICBNMVsiU3RvcmUgbmV3IGZhY3RzIl0KICAgICAgICBNMlsiQXV0by1jbGFzc2lmeSJdCiAgICAgICAgTTNbIkdyYXBoIHVwZGF0ZSJdCiAgICAgICAgTTRbIlBsYWNlIHJvdXRpbmciXQogICAgZW5kCiAgICBSRUNBTEwgLS0-IHwic3F1aXNoIHJlY2FsbCJ8IENMSTFbIkNMSSAvIE1DUCJdCiAgICBTRVNTSU9OUyAtLT4gfCJzcXVpc2ggc2Vzc2lvbnMgc2VhcmNoInwgQ0xJMlsiQ0xJIC8gTUNQIl0KICAgIFJFTUVNQkVSIC0tPiB8InNxdWlzaCByZW1lbWJlciJ8IENMSTNbIkNMSSAvIE1DUCJdCgogICAgY2xhc3NEZWYgcmVjYWxsIGZpbGw6IzRhOWVmZixzdHJva2U6IzJkN2RkMixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBzZXNzaW9ucyBmaWxsOiM3YzNhZWQsc3Ryb2tlOiM1YjIxYjYsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgcmVtZW1iZXIgZmlsbDojMDU5NjY5LHN0cm9rZTojMDQ3ODU3LGNvbG9yOiNmZmYKICAgIGNsYXNzRGVmIGNsaSBmaWxsOiNmM2Y0ZjYsc3Ryb2tlOiM5Y2EzYWYsY29sb3I6IzM3NDE1MQoKICAgIGNsYXNzIFIxLFIyLFIzLFI0IHJlY2FsbAogICAgY2xhc3MgUzEsUzIsUzMsUzQgc2Vzc2lvbnMKICAgIGNsYXNzIE0xLE0yLE0zLE00IHJlbWVtYmVyCiAgICBjbGFzcyBDTEkxLENMSTIsQ0xJMyBjbGkK" alt="Three-Layer Memory Model" width="780" />
</p>

### Storage Layer

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">SQLite (default)</th>
      <th style="padding: 10px 14px; text-align: left;">Squish Cloud Team</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">memories</td>
      <td style="padding: 10px 14px;">memories</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">associations</td>
      <td style="padding: 10px 14px;">associations</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">embeddings</td>
      <td style="padding: 10px 14px;">embeddings</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">graph_edges</td>
      <td style="padding: 10px 14px;">graph_edges</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">places</td>
      <td style="padding: 10px 14px;">places</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">sessions</td>
      <td style="padding: 10px 14px;">sessions</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;">AES-256-GCM encryption</td>
      <td style="padding: 10px 14px;">AES-256-GCM encryption</td>
    </tr>
  </tbody>
</table>

---

## Squish Cloud

Persistent memory across ChatGPT, Claude Desktop, Claude Code, and local agents. One account, synchronized everywhere.

<p align="center">
  <img src="https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBDR1siQ2hhdEdQVFxuT0F1dGggMi4xIl0gLS0-IEFQSVsiU3F1aXNoIENsb3VkIEFQSSJdCiAgICBDRFsiQ2xhdWRlIERlc2t0b3Bcbk9BdXRoIDIuMSJdIC0tPiBBUEkKICAgIENDWyJDbGF1ZGUgQ29kZVxuU3RyZWFtYWJsZSBIVFRQIl0gLS0-IEFQSQogICAgTEFbIkxvY2FsIEFnZW50c1xuTUNQIC8gQ0xJIl0gLS0-IEFQSQogICAgQVBJIC0tPiBEQlsoIlBvc3RncmVTUUwgK1xuRW5jcnlwdGVkIFN0b3JhZ2UiKV0KICAgIERCIC0tPiBEYXNoYm9hcmRbIkFkbWluIERhc2hib2FyZFxuJiBBbmFseXRpY3MiXQoKICAgIGNsYXNzRGVmIGNsaWVudCBmaWxsOiM0YTllZmYsc3Ryb2tlOiMyZDdkZDIsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgYXBpIGZpbGw6IzdjM2FlZCxzdHJva2U6IzViMjFiNixjb2xvcjojZmZmCiAgICBjbGFzc0RlZiBkYiBmaWxsOiMwNTk2Njksc3Ryb2tlOiMwNDc4NTcsY29sb3I6I2ZmZgogICAgY2xhc3NEZWYgZGFzaCBmaWxsOiNkOTc3MDYsc3Ryb2tlOiNiNDUzMDksY29sb3I6I2ZmZgoKICAgIGNsYXNzIENHLENELENDLExBIGNsaWVudAogICAgY2xhc3MgQVBJIGFwaQogICAgY2xhc3MgREIgZGIKICAgIGNsYXNzIERhc2hib2FyZCBkYXNoCg" alt="Squish Cloud Architecture" width="600" />
</p>

**Cloud features:** OAuth 2.1 + PKCE login, cross-platform sync, team workspaces, admin dashboard, priority support.

### Pricing

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Tier</th>
      <th style="padding: 10px 14px; text-align: left;">Price</th>
      <th style="padding: 10px 14px; text-align: left;">Storage</th>
      <th style="padding: 10px 14px; text-align: left;">Users</th>
      <th style="padding: 10px 14px; text-align: left;">Features</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Local</td>
      <td style="padding: 10px 14px;">Free</td>
      <td style="padding: 10px 14px;">Local SQLite</td>
      <td style="padding: 10px 14px;">1</td>
      <td style="padding: 10px 14px;">Full memory, CLI, MCP, Web UI</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Cloud Solo</td>
      <td style="padding: 10px 14px;">$9/mo</td>
      <td style="padding: 10px 14px;">50 MB synced</td>
      <td style="padding: 10px 14px;">1</td>
      <td style="padding: 10px 14px;">Cloud sync, OAuth, dashboard</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Cloud Pro</td>
      <td style="padding: 10px 14px;">$29/mo</td>
      <td style="padding: 10px 14px;">250 MB synced</td>
      <td style="padding: 10px 14px;">1</td>
      <td style="padding: 10px 14px;">Pro features, priority support</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Team</td>
      <td style="padding: 10px 14px;">$99/mo</td>
      <td style="padding: 10px 14px;">1 GB shared</td>
      <td style="padding: 10px 14px;">Up to 10</td>
      <td style="padding: 10px 14px;">Shared workspaces, admin</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;">Founder Pass</td>
      <td style="padding: 10px 14px;">$99/yr</td>
      <td style="padding: 10px 14px;">Pro features</td>
      <td style="padding: 10px 14px;">1</td>
      <td style="padding: 10px 14px;">Launch-only annual pricing</td>
    </tr>
  </tbody>
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
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Metric</th>
      <th style="padding: 10px 14px; text-align: left;">Result</th>
      <th style="padding: 10px 14px; text-align: left;">Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Core Tests</td>
      <td style="padding: 10px 14px;">9/9 passed (100%)</td>
      <td style="padding: 10px 14px;">All memory operations</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">LoCoMo Memory</td>
      <td style="padding: 10px 14px;">65%</td>
      <td style="padding: 10px 14px;">100 REAL questions from locomo10.json</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Throughput</td>
      <td style="padding: 10px 14px;">39 ops/sec</td>
      <td style="padding: 10px 14px;">With local embeddings</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Total Time</td>
      <td style="padding: 10px 14px;">230ms</td>
      <td style="padding: 10px 14px;">For 9 core tests</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;">Package Size</td>
      <td style="padding: 10px 14px;">283 KB</td>
      <td style="padding: 10px 14px;">Lightweight footprint</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;">Latency (embed)</td>
      <td style="padding: 10px 14px;">6.6ms</td>
      <td style="padding: 10px 14px;">Local TF-IDF embeddings</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;">Latency (search)</td>
      <td style="padding: 10px 14px;">6.1ms</td>
      <td style="padding: 10px 14px;">Hybrid retrieval</td>
    </tr>
  </tbody>
</table>

Full benchmark details: [docs/BENCHMARK.md](docs/BENCHMARK.md)

---

## Documentation

<table>
  <thead>
    <tr style="background-color: #f6f8fa; border-bottom: 2px solid #d0d7de;">
      <th style="padding: 10px 14px; text-align: left;">Document</th>
      <th style="padding: 10px 14px; text-align: left;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><a href="docs/CLI.md">CLI Reference</a></td>
      <td style="padding: 10px 14px;">All CLI commands and options</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><a href="docs/MCP-SERVER.md">MCP Server</a></td>
      <td style="padding: 10px 14px;">15 MCP tools and configuration</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><a href="docs/ARCHITECTURE.md">Architecture</a></td>
      <td style="padding: 10px 14px;">System design and data flow</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><a href="docs/DECAY.md">Decay System</a></td>
      <td style="padding: 10px 14px;">How memories age and lose relevance</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><a href="docs/v2-scoring.md">Scoring</a></td>
      <td style="padding: 10px 14px;">Importance and relevance scoring</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><a href="docs/ENV-CONFIG.md">Environment Config</a></td>
      <td style="padding: 10px 14px;">Environment variables and settings</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><a href="docs/PLUGIN-ARCHITECTURE.md">Plugin Architecture</a></td>
      <td style="padding: 10px 14px;">Hook system and agent integration</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><a href="docs/INSTALL-QUICKSTART.md">Quick Start</a></td>
      <td style="padding: 10px 14px;">Getting started guide</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de;">
      <td style="padding: 10px 14px;"><a href="docs/agent-memory-comparison.md">Agent Comparison</a></td>
      <td style="padding: 10px 14px;">Squish vs other memory tools</td>
    </tr>
    <tr style="border-bottom: 1px solid #d0d7de; background-color: #f6f8fa;">
      <td style="padding: 10px 14px;"><a href="docs/CONTRIBUTING.md">Contributing</a></td>
      <td style="padding: 10px 14px;">How to contribute</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px;"><a href="docs/RELEASE_NOTES.md">Release Notes</a></td>
      <td style="padding: 10px 14px;">Changelog and version history</td>
    </tr>
  </tbody>
</table>

---

## FAQ

### What is Squish?

Squish is a local-first memory runtime for AI coding agents. It gives your agents stable orientation, durable memory, and searchable session history across runs. Think of it as a brain that persists between sessions — your agents remember decisions, constraints, preferences, and context without you having to re-explain everything. In v1.6.0, Squish also searches past agent sessions as evidence, so agents can inspect prior work instead of starting from zero.

### Does Squish require an API key?

No. Squish works locally by default with zero API keys. It uses local embeddings (TF-IDF) and SQLite storage. You can optionally configure an external LLM for enhanced reasoning, but it's not required. An API key is only needed if you want to use the paid Squish Cloud for cross-device sync.

### How does Squish compare to mem0 or agentmemory?

Squish is the only option that works locally with zero external dependencies. mem0 requires Qdrant (a vector database) and cloud API calls. agentmemory requires iii-engine. Squish uses SQLite and local embeddings by default. See the full comparison in the [Why Squish](#why-squish) section above.

### Can I use Squish with multiple AI agents?

Yes. Squish works with any MCP-compatible agent. One memory server is shared across Claude Code, Cursor, Codex, Copilot, Gemini CLI, and any other agent that supports MCP. Memories are available to all connected agents.

### Is my data private with Squish?

Yes. In local mode, all data stays on your machine in an encrypted SQLite database. Nothing is sent to any cloud service. AES-256-GCM encryption protects sensitive memories. In cloud mode, data is encrypted in transit and at rest.

### What databases does Squish support?

Squish supports SQLite (default, local) and Squish Cloud team workspaces backed by PostgreSQL. SQLite requires zero configuration. Team workspaces are only available on Squish Cloud and are used for shared memory across multiple users.

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
