# Squish - Universal Memory for AI Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![npm downloads](https://img.shields.io/npm/dm/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Give any AI agent persistent, intelligent memory.** Without memory, agents forget everything between sessions. With Squish, they learn and adapt over time.

> Squish does not have a crypto token, has no token launch planned, and nobody is authorized to launch one on behalf of the project.

```bash
bun add squish-memory
```

## Why Memory Matters

| Without Squish | With Squish |
|----------------|-------------|
| Forgets everything after session | Remembers across sessions |
| Repeats the same mistakes | Learns from past decisions |
| No project awareness | Builds understanding over time |
| Can't track preferences | Adapts to your style |

## How It Works

**Two-tier architecture** for optimal speed and durability:

```
User Action ──► Trigger Detection ──► Write Gate ──► Short-term (QMD)
                                                             │
                                                         Long-term (SQLite/PG)
                                                             │
                                                         Hybrid Retrieval
                                                             │
                                                      Agent Context
```

- **Short-term (QMD)**: Lightning-fast file-based search. Instant recall for recent context.
- **Long-term (SQLite/PG)**: Durable storage. SQLite for local, PostgreSQL for teams.

## Quick Start

### Install with add-mcp (Recommended)
One command installs to Claude Code, OpenCode, Cursor, VS Code, Codex, and more:

```bash
npx add-mcp squish-memory
```

Or traditional npm install:

```bash
bun add squish-memory
```

```bash
# Store a memory
squish remember "User prefers TypeScript over JavaScript"

# Save a quick note
squish note "Revisit caching strategy after launch"

# Record an observation
squish learn observation "Updated auth flow" --action edit

# Record a fix or lesson learned
squish learn fix "Patched auth middleware regression"

# Search memories
squish search "coding preferences"

# List projects, then inspect relevant context
squish context --list-projects
squish context

# Get relevant context or fetch by ID
squish recall "user preferences"
```

Or use as a plugin:

```bash
# Install for Claude Code
npx squish-memory install-plugin --client=claude-code

# Install for OpenCode
npx squish-memory install-plugin --client=opencode
```

## Features

### Memory Intelligence
- Auto-detects "remember this", "important", corrections
- Handles contradictions when facts change
- Temporal facts with expiration ("until January")
- Confidence scoring for each memory
- **Tier lifecycle**: hot/warm/cold memory tiers with automatic decay
- **Graph-boosted retrieval**: associations between memories boost relevance

### Retrieval Quality
- Hybrid search: semantic + keyword (BM25) with Reciprocal Rank Fusion
- Multi-factor ranking: relevance, recency, importance, graph-boost
- LLM-powered context extraction with Ollama (local)
- **Graph associations**: memories linked by coactivation boost search results

### Security & Encryption
- **Client-side encryption**: AES-256-GCM encryption for sensitive memories
- **Passphrase management**: `squish_set_passphrase` and `squish_rotate_key` MCP tools
- Optional encryption via `SQUISH_ENCRYPTION_PASSPHRASE` env var

### Universal Compatibility
- **CLI**: `squish config`, `squish remember`, `squish note`, `squish learn`, `squish search`, `squish context`, `squish stats`
- **MCP Server**: Works with Claude Code, OpenCode, Cursor, VS Code, OpenClaw
- **HTTP API**: REST API + WebSocket for any agent
- **SQLite**: Local, zero-config
- **PostgreSQL**: Team mode with Supabase/pgvector
- **QMD Integration**: Native .md file search via QMD

### Current MCP Tools
- `squish_remember`, `squish_search`, `squish_recall`, `squish_forget`, `squish_update`
- `squish_link`, `squish_context`, `squish_learn`, `squish_health`, `squish_stats`
- `squish_confidence`, `squish_pin`, `squish_set_passphrase`, `squish_rotate_key`
- `squish_recent`, `squish_stale`, `squish_note`, `squish_tag`

## Benchmark Results

Real tests using [LoCoMo](https://github.com/snap-research/locomo) benchmark (22 questions):

| Metric | Result |
|--------|--------|
| **LoCoMo Score** | **77%** |
| Embedding Latency | 1-5ms |
| API Latency | 1-20ms |
| Max Throughput | 943 ops/sec |
| Package Size | **283 KB** |

### vs Cloud Solutions

| | Squish | Cloud Memory |
|--|--------|-------------|
| **Cost** | $0 | API fees |
| **Local-first** | Yes | No |
| **Setup** | 1 command | 3+ steps |
| **API keys** | None | Required |
| **LoCoMo** | 77% | 75-81% |

Squish matches cloud solutions on accuracy while running 100% locally with zero API costs.

## Supported Clients

| Client | Status |
|--------|--------|
| Claude Code | Stable |
| OpenCode | Stable |
| OpenClaw | Stable |
| Cursor | Beta |
| VS Code | Beta |
| Windsurf | Beta |

## Configuration

**Zero config required** - works out of the box with local embeddings.

For customization:

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
- **QMD (Files)**: BM25 + vectors for fast recall
- **SQLite/PostgreSQL**: ACID-compliant persistent storage

### Interfaces
- **MCP**: Native agent integration
- **HTTP**: REST + WebSocket
- **CLI**: Shell and scripts

### Memory Lifecycle
- **Sectors**: episodic, semantic, procedural, autobiographical
- **Tiers**: hot (recent), warm (accessible), cold (archived)
- **Status**: active, merged, superseded, expired

## Development

```bash
bun install
bun run build
bun test
bun run verify:mcp
```

## Troubleshooting

```bash
# Reset local database
rm -rf .squish/squish.db

# Verify MCP setup
bun run verify:mcp

# Check health
squish health
```

## CLI Command Families

- Setup/runtime: `squish`, `squish config`, `squish install`, `squish run mcp`, `squish run web`
- Capture/retrieval: `squish remember`, `squish note`, `squish learn`, `squish search`, `squish recall`, `squish recent`
- Memory management: `squish update`, `squish forget`, `squish pin`, `squish confidence`, `squish tag`, `squish stale`, `squish link`
- Context/project discovery: `squish context --list-projects`, `squish context`
- System: `squish health`, `squish stats`

## License

MIT License. See [LICENSE](LICENSE).

## Links

- [Documentation](https://github.com/michielhdoteth/squish)
- [Benchmarks](docs/BENCHMARK.md)
- [Issues](https://github.com/michielhdoteth/squish/issues)
