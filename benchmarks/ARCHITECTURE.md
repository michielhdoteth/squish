# Squish Benchmark Architecture

## Overview

This benchmark suite compares memory systems using standardized datasets like LoCoMo and LongMemEval.

## IMPORTANT: Mock vs Real Squish

### Mock Implementation (Original)
The original benchmark used a **mock Squish provider** that:
- Stored memories in a JavaScript `Map<string, Memory>` (in-memory, not persistent)
- Used **cosine similarity on embeddings** for retrieval (vector search)
- Generated embeddings via Ollama (local LLM)

**Problem**: This doesn't match how Squish actually works.

### Real Squish Implementation (Current)
The updated `squish-claude.ts` provider uses **actual Squish core**:

| Component | Mock | Real Squish |
|-----------|------|-------------|
| Storage | In-memory Map | SQLite file OR PostgreSQL |
| Search | Cosine similarity on embeddings | **FTS5** (SQLite) or **pgvector** (PostgreSQL) |
| Embeddings | Always Ollama | Configurable: TF-IDF, Ollama, or OpenAI |
| Persistence | None (reset on restart) | Persistent across restarts |
| Architecture | Simulated | Actual production code |

### Squish Search Modes

**SQLite Mode (Local - Default)**
- Uses **FTS5** (Full-Text Search) - not vector similarity
- Embeddings stored but **NOT used for retrieval**
- Fast text-based search with BM25 ranking
- Good for: Local development, single-user

**PostgreSQL Mode (Team)**
- Uses **pgvector** for cosine similarity search
- Embeddings **ARE used** for vector retrieval
- Requires `DATABASE_URL` pointing to PostgreSQL
- Good for: Production, multi-user, semantic search

### How to Run Real Squish Benchmark

```bash
# 1. Ensure Squish is set up
cd ../squish
bun install
bun run build

# 2. Set up environment (SQLite mode - default)
export SQUISH_DATA_DIR=./.squish

# OR PostgreSQL mode (for vector search)
export DATABASE_URL=postgres://squish:squish_dev@localhost:5432/squish
docker-compose up -d  # Start PostgreSQL

# 3. Set up embeddings (optional)
export SQUISH_EMBEDDINGS_PROVIDER=ollama  # or 'openai' or 'local' (TF-IDF)
export SQUISH_OLLAMA_URL=http://localhost:11434
ollama pull nomic-embed-text

# 4. Run the benchmark
cd ../benchmark
export ANTHROPIC_API_KEY=sk-ant-api03-...
bun run src/index.ts run-claude -c claude-3-haiku-20240307
```

### Verification

To verify you're using real Squish:
1. Check the console output shows "Initializing REAL Squish core..."
2. Confirm the mode: "SQLite + FTS5" or "PostgreSQL + pgvector"
3. Check that `.squish/` folder grows after ingestion (SQLite mode)

### Benchmark Results Comparison

| System | Dataset | Accuracy | Notes |
|--------|---------|----------|-------|
| Mem0 | LoCoMo | 66.9% | Cloud service |
| Supermemory | LongMemEval | 81.6% | Cloud service |
| **Squish (Mock)** | LoCoMo | **100%** | *Not representative* |
| **Squish (Real)** | LoCoMo | **TBD** | *Actual production code* |

The mock achieved 100% because vector similarity + perfect embeddings is artificially powerful. Real Squish results will differ based on:
- SQLite FTS5 vs PostgreSQL pgvector (text vs semantic search)
- Embedding quality (TF-IDF vs Ollama vs OpenAI)
- Session isolation implementation

### File Locations

```
benchmark/
├── src/providers/
│   ├── squish-claude.ts      # ← REAL Squish + Claude
│   ├── mock.ts                # Mock provider (for reference)
│   └── ...
├── src/pipeline/
│   ├── runner-claude.ts       # ← Uses real Squish
│   └── ...
└── data/runs/                 # Benchmark results

squish/
├── core/memory/memories.ts    # ← ACTUAL implementation
├── db/
│   ├── index.ts               # Database connection
│   └── schema.ts              # Table definitions
└── config.ts                  # Mode selection (SQLite vs PostgreSQL)
```
