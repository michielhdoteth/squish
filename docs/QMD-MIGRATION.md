# QMD Integration Migration Guide

## Overview

Squish v0.7.0 integrates **QMD** (Quick Markdown Search) for enhanced hybrid search with BM25+vector+reranking. This guide helps you migrate and configure the integration.

## What is QMD?

QMD is a local CLI search engine that combines:
- **BM25 full-text search** (SQLite FTS5)
- **Vector semantic search** (local embeddings)
- **LLM re-ranking** (Qwen3-Reranker-0.6B)
- **Query expansion** (Qwen3-1.7B)

All models run locally via GGUF format (~2GB total).

## Installation

### Step 1: Install QMD

```bash
bun install -g qmd
```

### Step 2: Verify Installation

```bash
qmd --version
qmd status
```

### Step 3: Enable QMD in Squish

Set environment variable:

```bash
export SQUISH_QMD_ENABLED=true
```

Or add to `.env`:

```
SQUISH_QMD_ENABLED=true
```

## Configuration

### Collection Mapping

Configure how Squish memories map to QMD collections:

```bash
export SQUISH_QMD_COLLECTION_MAPPING='{
  "observation": "squish-observations",
  "fact": "squish-facts",
  "decision": "squish-decisions",
  "context": "squish-context",
  "preference": "squish-preferences"
}'
```

### Fallback Mode

Choose how QMD behaves when unavailable:

```bash
# Use only QMD (fails if unavailable)
export SQUISH_QMD_FALLBACK=qmd-only

# Try QMD first, fallback to cloud
export SQUISH_QMD_FALLBACK=hybrid

# Use cloud providers first
export SQUISH_QMD_FALLBACK=cloud-first

# Use local TF-IDF only
export SQUISH_QMD_FALLBACK=local-only
```

### Embedding Provider

Set QMD as embedding provider:

```bash
# Use QMD for search (recommended)
export SQUISH_EMBEDDINGS_PROVIDER=qmd

# Or use hybrid mode (QMD + cloud)
export SQUISH_EMBEDDINGS_PROVIDER=hybrid
```

## New MCP Tool

### qmd_search

Enhanced search using QMD's hybrid pipeline:

```bash
# Full hybrid search with reranking (best quality)
/squish:qmd_search query="authentication flow" limit=10

# Semantic search only (faster)
/squish:qmd_search query="API design" useHybrid=false limit=5

# Search specific collection
/squish:qmd_search query="deployment" type=decision limit=10
```

Parameters:
- `query` (required): Search query string
- `type` (optional): Memory type filter (observation/fact/decision/context/preference)
- `limit` (optional): Max results (default: 10)
- `useHybrid` (optional): Use full hybrid pipeline (default: true)
- `collection` (optional): Override default collection mapping

## Memory Sync

Memories are automatically synced to QMD collections when stored:

```bash
/squish:remember content="JWT token expires after 1 hour" type=fact
```

The memory will be synced to `squish-facts` collection automatically.

Sync files are located in:
- Default: `qmd-collections/` (next to `.squish/`)
- Configurable via `SQUISH_QMD_COLLECTIONS_PATH`

## Architecture

### QMD Search Pipeline

```
Query -> Query Expansion (LLM)
       -> [Original, Variant 1, Variant 2]
       -> Parallel BM25 (FTS5) + Vector Search
       -> RRF Fusion
       -> LLM Re-ranking (top 30)
       -> Position-Aware Blending
       -> Final Results
```

### Squish + QMD Integration

```
Squish Core
├── Memory Storage (SQLite/PostgreSQL)
├── Embedding Providers (OpenAI/Ollama/Local/QMD)
└── Search Layer
    ├── Standard Search (cosine similarity)
    └── QMD Hybrid Search (BM25 + Vector + Rerank)

QMD Integration
├── QMD MCP Client (qmd mcp)
├── Memory Sync (writes to qmd-collections/)
└── Collection Mapping (configurable)
```

## Troubleshooting

### QMD Not Available

If you see "QMD unavailable" errors:

1. Check QMD installation: `qmd --version`
2. Verify MCP server: `qmd mcp` (should start MCP server)
3. Check Squish config: `echo $SQUISH_QMD_ENABLED`

### Sync Issues

If memories aren't syncing:

1. Check collections directory: `ls qmd-collections/`
2. Reindex QMD: `qmd update`
3. Regenerate embeddings: `qmd embed -f`

### Performance

QMD uses ~2GB of models. To improve performance:

1. Pre-generate embeddings: `qmd embed`
2. Use semantic search (faster than hybrid): `useHybrid=false`
3. Limit collection size: Split into smaller collections

### Memory Not Found

If QMD search returns Squish memories but not the right ones:

1. Check collection mapping: `echo $SQUISH_QMD_COLLECTION_MAPPING`
2. Verify sync completed: `ls qmd-collections/squish-facts/`
3. Re-run sync: Squish will sync new memories automatically

## Rollback

To disable QMD integration:

```bash
export SQUISH_QMD_ENABLED=false
export SQUISH_EMBEDDINGS_PROVIDER=ollama
```

Squish will use standard embedding providers.

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SQUISH_QMD_ENABLED` | `false` | Enable QMD integration |
| `SQUISH_QMD_COLLECTIONS_PATH` | `qmd-collections/` | QMD collections directory |
| `SQUISH_QMD_FALLBACK` | `hybrid` | Fallback mode |
| `SQUISH_QMD_COLLECTION_MAPPING` | See below | Memory type to collection mapping |
| `SQUISH_EMBEDDINGS_PROVIDER` | `ollama` | Set to `qmd` or `hybrid` for QMD |

### Default Collection Mapping

```json
{
  "observation": "squish-observations",
  "fact": "squish-facts",
  "decision": "squish-decisions",
  "context": "squish-context",
  "preference": "squish-preferences"
}
```

## Version History

- **v0.7.0**: Initial QMD integration
  - QMD MCP client
  - Hybrid search (qmd_search tool)
  - Memory sync to QMD collections
  - OpenClaw gateway integration
  - Configurable collection mapping

## Links

- [QMD GitHub](https://github.com/tobi/qmd) - QMD repository
- [Squish GitHub](https://github.com/michielhdoteth/squish) - Squish repository
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) - OpenClaw repository
