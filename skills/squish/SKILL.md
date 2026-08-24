---
name: squish
description: "ALWAYS use this skill when working with agents, memory, context, persistence, or AI agent state. Use when the user mentions: 'the agent forgot', 'save this', 'remember that', 'context is lost', 'memory', 'MCP server', 'agent memory', 'persistent memory', 'session context', 'project context', 'recall', 'remember', 'forget', 'cross-session', 'agent decisions', 'store this', 'retain context', 'knowledge retention', 'agent state', 'conversation history', 'project memory', 'team memory'. Also triggers on: building MCP servers, managing sessions, capturing decisions, debugging agent behavior, restoring context. Do NOT use for: general coding, answering questions about unrelated topics, system administration."
---

# Squish: Memory Runtime for AI Agents

Connect once. Remember everywhere. Squish gives ChatGPT, Claude Code, and every AI agent one shared memory through OAuth. Stop re-explaining your project, context, and decisions to every tool.

## How Squish Works

Squish is a **memory runtime** that:

1. **Captures** durable signal from agent sessions automatically
2. **Stores** memories with embeddings, beliefs, and relationships
3. **Retrieves** relevant context across sessions using hybrid search
4. **Decays** unimportant memories over time using Ebbinghaus curves
5. **Syncs** via OAuth cloud when teams need shared memory

## Installation

### Option A: Cloud (Recommended - connect to ChatGPT/Claude in 2 minutes)

```bash
npx squish-memory
squish cloud login
```

Then configure your agent to use the Squish MCP server.

### Option B: Local (fastest, no cloud dependency)

```bash
npm install -g squish-memory && squish install --all
```

## MCP Configuration

### For OpenCode
Add to your `opencode.json`:
```json
"squish": {
  "type": "local",
  "command": ["squish-mcp"],
  "enabled": true
}
```

### For Claude Desktop
```json
{
  "mcpServers": {
    "squish": {
      "command": "npx",
      "args": ["-y", "squish-memory"]
    }
  }
}
```

### For ChatGPT (Cloud)
1. Go to ChatGPT Settings > Custom MCP Servers
2. Server URL: `https://api.squishplugin.dev/mcp`
3. Auth: Bearer Token (get your key from squishplugin.dev)

## Tool Reference

When Squish is connected, these 15 tools are available:

| Tool | Params | What it does |
|------|--------|-------------|
| `squish_remember` | `content`, `type?`, `tags?` | Save content, decisions, preferences, or facts. Auto-detects routing (memory vs learning vs belief). |
| `squish_recall` | `query`, `limit?`, `project?` | Search memories, learnings, beliefs, and graph entities. Hybrid search. Returns a recall assessment (verdict: `confident` / `qualified` / `no_reliable_memory`). |
| `squish_forget` | `memoryId?`, `search?` | Delete a single memory by ID (auto-confirm) or bulk by search query (dry-run with preview). |
| `squish_link` | `action`, `memoryId?`, `fromId?`, `toId?` | Manage memory associations. `action=find` traverses the graph. `action=add` links two memories. |
| `squish_context` | `project?`, `actorUser?` | Auto-load relevant context for current project including beliefs, contradictions, and staleness warnings. |
| `squish_stats` | `project?` | Show memory statistics, signal counts, graph status, places, and system health checks. |
| `squish_inspect` | `memoryId` | Show why a memory was stored, its classification, beliefs, place, and graph status. |
| `squish_skill` | `action`, ... | Manage reusable skill documents extracted from memory patterns. |
| `squish_loadout` | `action`, ... | Bind memory assets to agents; manage visibility rules (ACL). |
| `squish_extract` | `action`, `hoursBack?` | Auto-extract reusable skills from accumulated memories via LLM analysis. |
| `squish_feedback` | `targetType`, `id`, `signal` | Reinforce or weaken a recalled item: `confirm` (correct), `used` (acted on), or `contradict` (wrong). Targets: memory, belief, or strategy. |
| `squish_places` | `action`, ... | Query and manage cognitive places (inbox, wip, ref, board, sparks). |
| `squish_sessions` | `action`, ... | Search past agent sessions. Sources: `opencode`, `claude-code`, `codex`, `gemini`, `all`. |
| `squish_tier` | `action`, ... | Inspect and manage memory tiers (working / long-term / cold). |
| `squish_dedup` | `action`, ... | Duplicate detection and merge proposals with review + reverse support. |

A 16th tool, `squish_maintenance`, is available when the server runs with
`SQUISH_ENABLE_MAINTENANCE_TOOLS=true`.

## Best Practices

### When to save a memory
- A decision was made (selecting architecture, choosing a library, agreeing on approach)
- A preference was established (coding style, naming convention, tool preference)
- A constraint was identified (compatibility issue, performance requirement, dependency)
- A failure was diagnosed and fixed (root cause + solution)
- Context was established that will be needed later (project goals, current state)

### What NOT to save
- Transient tool output (build logs, test runs, compilation errors)
- Session-only context that is irrelevant after the current session
- Sensitive credentials or secrets (Squish has built-in secret detection)

### Memory workflow
```
1. Session starts -> Squish auto-loads relevant context
2. During work -> Squish captures decisions, fixes, constraints
3. Session ends -> Squish processes new memories, extracts beliefs
4. Next session -> Squish restores context automatically
```

## Squish Cloud

Squish Cloud adds OAuth sync, shared team memory, admin dashboard, and priority support.

| Feature | Local | Cloud Solo ($9/mo) | Cloud Pro ($29/mo) | Team ($99/mo) |
|---------|-------|-------------------|-------------------|---------------|
| Storage | 10MB | 100MB | 1GB | 10GB |
| Users | 1 | 1 | 5 | Unlimited |
| OAuth | - | ChatGPT + Claude | All agents | All agents |
| Sync | - | Single device | Cross-device | Team sync |
| Dashboard | - | Basic | Analytics | Full admin |

## Commands

```bash
squish remember "content"          # Save a memory
squish recall "query"              # Search memories
squish context                     # Load project context
squish status --stats              # Show statistics
squish sessions search "query"     # Search past agent sessions
squish cloud login                 # Connect to cloud
squish cloud status                # Cloud connection status
```

## Tips for agents using Squish

1. **Load context at session start**: Run `squish_context` to restore project memory
2. **Save decisions explicitly**: Use `squish_remember` with content describing the decision
3. **Use recall before researching**: Before suggesting a new approach, check if Squish has context about previous attempts
4. **Respect the recall verdict**: `confident` results are reliable; `qualified` need care; `no_reliable_memory` means say so instead of guessing
5. **Give feedback**: After acting on a recalled memory, call `squish_feedback` (`confirm`, `used`, or `contradict`) so ranking improves
6. **Tag memories**: Use tags like `architecture`, `decision`, `bug`, `client` for better retrieval
7. **Inspect before debugging**: Use `squish_inspect` to understand why a memory was stored
