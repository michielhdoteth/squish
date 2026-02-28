# Squish - The Memory Layer for AI Agents

**Squish gives AI agents persistent, intelligent memory.** Without memory, agents forget everything between sessions. With Squish, they learn, adapt, and get smarter over time.

```bash
npm install squish-memory
```

## Why Agents Need Memory

| Without Squish | With Squish |
|----------------|-------------|
| Forgets after every session | Remembers across sessions |
| Repeats the same mistakes | Learns from past decisions |
| No context awareness | Builds project understanding |
| Can't track preferences | Adapts to user style |

## How It Works

```
Agent Action -----> [Squish Memory Layer]
                           |
                           v
                    ┌──────────────┐
                    │  Trigger     │ <-- "remember this", "important"
                    │  Detection   │
                    └──────────────┘
                           |
                           v
                    ┌──────────────┐
                    │  Write Gate  │ <-- Validate, sanitize, score
                    └──────────────┘
                           |
                           v
                    ┌──────────────┐
                    │  Storage     │ <-- SQLite (local) / Postgres (team)
                    └──────────────┘
                           |
                           v
                    ┌──────────────┐
                    │  Retrieval   │ <-- Hybrid search + ranking
                    └──────────────┘
                           |
                           v
                    Agent Context
```

## Key Features

### Memory Intelligence
- **Trigger Detection**: Auto-detects "remember", "important", corrections
- **Contradiction Resolution**: Auto-updates when facts change
- **Temporal Facts**: Handles time-bound information ("until January")
- **Confidence Scoring**: Knows how reliable each memory is

### Retrieval Quality
- **Hybrid Search**: Vector + keyword (BM25) with fusion
- **Multi-factor Ranking**: Semantic, recency, importance, confidence
- **Telemetry**: Tracks which memories are actually useful

### Agent Safety
- **Write Gate**: Validates content before storage
- **Secret Detection**: Auto-redacts API keys, passwords
- **Graceful Degradation**: Works even when database fails

## Quick Start

### For Claude Code (Plugin)
```bash
# Install from marketplace
/plugin marketplace add https://github.com/michielhdoteth/squish.git
/plugin install squish@michielhdoteth-squish
```

Done. Your Claude Code now has memory.

### For OpenClaw (npm)
```bash
npm install -g squish-memory
```

Add to your OpenClaw MCP config - done. Your OpenClaw now has memory.

### CLI (Fallback)
```bash
# Works when MCP is unavailable
squish remember "User prefers TypeScript"
squish search "preferences"
squish health
```

**That's it.** One install, persistent memory for your agent.

## MCP Tools for Agents

| Tool | What It Does |
|------|--------------|
| `remember` | Store a memory |
| `search` | Find relevant memories |
| `recall` | Get specific memory by ID |
| `core_memory` | Always-visible context (persona, user info) |
| `context` | Get project-relevant memories |
| `observe` | Record patterns from tool usage |

## Execution Model

- **MCP-first**: Works with Claude Code, OpenClaw, any MCP client
- **CLI fallback**: When MCP fails, use `squish` command directly
- **Local-first**: SQLite by default, Postgres for teams

## Open-Core Model

- **OSS Core (MIT)**: local mode, self-hosted workflows, MCP/CLI tooling
- **Commercial Remote**: managed remote control plane, enterprise ops, support
- **Sponsor development**: https://github.com/sponsors/michielhdoteth

## Configuration

### Environment Variables

**Required (local mode - default):**
- None! Works out-of-the-box with local TF-IDF embeddings

**Optional:**
```bash
SQUISH_DATA_DIR=./.squish          # Custom data directory
SQUISH_EMBEDDINGS_PROVIDER=local   # local, openai, or ollama

# For better embeddings (optional)
SQUISH_OPENAI_API_KEY=sk-...
SQUISH_OLLAMA_URL=http://localhost:11434

# For team mode
DATABASE_URL=postgresql://user:pass@host/db
```

## Architecture

### Memory Tiers
- **Core Memory (2KB)**: Always-visible, 4 sections (persona, user_info, project_context, working_notes)
- **Context Paging**: Agent-controlled loading with token budgeting (8KB default)
- **Background Jobs**: Decay, deduplication, consolidation

### Memory Lifecycle
- **Sectors**: episodic, semantic, procedural, autobiographical, working
- **Tiers**: hot (recent), warm (accessible), cold (archived)
- **Status**: active, merged, superseded, expired

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# Verify MCP
bun run verify:mcp
```

## Troubleshooting

### Database Issues
- **SQLite corrupted**: Delete `.squish/squish.db` and restart
- **PostgreSQL connection**: Verify DATABASE_URL format

### MCP Issues
- **Hooks not working**: Run `bun run build` first
- **API prompts**: Set `SQUISH_EMBEDDINGS_PROVIDER=local`

## License

MIT for OSS core. See `LICENSE` for details.

## Links

- GitHub: https://github.com/michielhdoteth/squish
- Issues: https://github.com/michielhdoteth/squish/issues
- Sponsors: https://github.com/sponsors/michielhdoteth
