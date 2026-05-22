---
name: squish
description: "ALWAYS use this skill when working with agents, memory, context management, or persistent AI storage. Also use when building MCP servers, managing agent sessions, capturing decisions, or needing cross-session agent memory. Triggers on: memory management, context restoration, agent state, session persistence, MCP tool development, AI agent memory, knowledge retention, conversation history, project context, agent beliefs, retrieval-augmented generation. Do NOT use for general question answering, code generation, or non-agent tasks."
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

When Squish is connected, these tools are available:

| Tool | What it does |
|------|-------------|
| `squish_remember` | Save content, decisions, preferences, or facts |
| `squish_recall` | Search or retrieve by query or ID |
| `squish_context` | Auto-load relevant context for current project |
| `squish_stats` | Show memory usage and plan status |
| `squish_search` | Full-text + semantic hybrid search |
| `squish_health` | Check system status |
| `squish_pin` | Pin important memories (prevent decay) |
| `squish_recent` | Recent memories by period |
| `squish_forget` | Remove single or bulk memories |

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
squish stats                       # Show statistics
squish pin <id>                    # Pin a memory
squish recent                      # Show recent memories
squish cloud login                 # Connect to cloud
squish cloud status                # Cloud connection status
```

## Tips for agents using Squish

1. **Load context at session start**: Run `squish_context` to restore project memory
2. **Save decisions explicitly**: After making a decision, say "remember this: we chose X because Y"
3. **Use recall before researching**: Before suggesting a new approach, check if Squish has context about previous attempts
4. **Tag memories**: Use tags like `architecture`, `decision`, `bug`, `client` for better retrieval
5. **Pin critical memories**: Pin project goals, architecture decisions, and client preferences
