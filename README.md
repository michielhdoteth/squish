# Squish - Universal Memory for AI Agents

[![npm version](https://img.shields.io/npm/v/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![npm downloads](https://img.shields.io/npm/dm/squish-memory)](https://www.npmjs.com/package/squish-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Give any AI agent persistent, intelligent memory.** Without memory, agents forget everything between sessions. With Squish, they learn and adapt over time.

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

# Search memories
squish search "coding preferences"

# Get relevant context
squish recall --query "user preferences"
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

### Retrieval Quality
- Hybrid search: semantic + keyword (BM25)
- Multi-factor ranking: relevance, recency, importance
- LLM-powered context extraction with Ollama (local)

### Universal Compatibility
- **CLI**: `squish remember`, `squish search`, `squish stats`
- **MCP Server**: Works with Claude Code, OpenCode, Cursor, VS Code
- **HTTP API**: REST API + WebSocket for any agent
- **SQLite**: Local, zero-config
- **PostgreSQL**: Team mode with pgvector

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

## License

MIT License. See [LICENSE](LICENSE).

## Links

- [Documentation](https://github.com/michielhdoteth/squish)
- [Benchmarks](docs/BENCHMARK.md)
- [Issues](https://github.com/michielhdoteth/squish/issues)
