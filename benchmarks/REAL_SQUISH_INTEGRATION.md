# Real Squish Integration - Summary

## Issue Identified

The original benchmark was using a **mock Squish implementation** that did NOT represent the actual Squish architecture:

```typescript
// MOCK (old) - NOT real Squish
class MockSquishProvider {
  private memories: Map<string, Memory> = new Map(); // In-memory only!
  
  async search(query: string) {
    // Cosine similarity on embeddings - NOT how SQLite mode works!
    return Array.from(this.memories.values())
      .map(m => ({ score: cosineSimilarity(queryEmbedding, m.embedding) }))
      .sort((a, b) => b.score - a.score);
  }
}
```

### What the Mock Got Wrong
1. **Storage**: Used in-memory `Map` instead of SQLite/PostgreSQL
2. **Search**: Used cosine similarity instead of FTS5 (SQLite) or pgvector (PostgreSQL)
3. **Embeddings**: Always used Ollama, not respecting Squish config (TF-IDF/Ollama/OpenAI)

## Solution Implemented

Updated `squish-claude.ts` to use **ACTUAL Squish core**:

```typescript
// REAL Squish (current)
class SquishClaudeProvider {
  async ingest(session: ConversationSession) {
    // Calls REAL Squish function
    await squishModule.rememberMemory({
      content,
      type: 'observation',
      project: this.project,
      // ... real database storage
    });
  }
  
  async search(query: string) {
    // Calls REAL Squish function
    return await squishModule.searchMemories({
      query,
      project: this.project,
      // Uses FTS5 (SQLite) or pgvector (PostgreSQL) - REAL architecture!
    });
  }
}
```

## Key Changes

### Files Modified
1. **`src/providers/squish-claude.ts`** - Now uses real Squish core imports
2. **`src/pipeline/runner-claude.ts`** - Updated to use real provider, removed Ollama checks
3. **`src/index.ts`** - Simplified CLI options (embeddings now handled by Squish config)

### Files Removed
- `src/providers/squish-real-benchmark.ts` - Redundant
- `src/providers/squish-real.ts` - Redundant

### Files Added
- `ARCHITECTURE.md` - Documents mock vs real architecture differences

## How Real Squish Works

### SQLite Mode (Local - Default)
```sql
-- Uses FTS5 (Full-Text Search), NOT vector similarity
SELECT * FROM memories 
JOIN memories_fts ON memories_fts.rowid = memories.rowid
WHERE memories_fts MATCH ?
ORDER BY created_at DESC
```

**Key points:**
- Embeddings are stored but **NOT used** for retrieval
- BM25 text ranking
- Fast for keyword-based search

### PostgreSQL Mode (Team)
```sql
-- Uses pgvector for cosine similarity
SELECT *, embedding <-> $1 as distance
FROM memories
ORDER BY embedding <-> $1
LIMIT $2
```

**Key points:**
- Embeddings **ARE used** for vector search
- Requires `DATABASE_URL` to PostgreSQL
- True semantic similarity

## Running the Benchmark

### Prerequisites
```bash
# 1. Squish must be built
cd ../squish
bun install
bun run build

# 2. For Ollama embeddings (optional)
ollama pull nomic-embed-text
ollama serve
```

### SQLite Mode (Default)
```bash
cd benchmark
export ANTHROPIC_API_KEY=sk-ant-api03-...
export SQUISH_DATA_DIR=../squish/.squish

bun run src/index.ts run-claude -c claude-3-haiku-20240307
```

### PostgreSQL Mode (Vector Search)
```bash
# Start PostgreSQL
cd ../squish
docker-compose up -d

# Run benchmark
cd benchmark
export DATABASE_URL=postgres://squish:squish_dev@localhost:5432/squish
export SQUISH_EMBEDDINGS_PROVIDER=ollama
export ANTHROPIC_API_KEY=sk-ant-api03-...

bun run src/index.ts run-claude -c claude-3-haiku-20240307
```

## Verification

When running real Squish, you'll see:
```
📦 Initializing REAL Squish core...
✅ Squish mode: local (SQLite + FTS5)
✅ Database connected

# OR for PostgreSQL:
✅ Squish mode: team (PostgreSQL + pgvector)
```

## Expected Results

The mock achieved 100% accuracy because vector similarity + embeddings is artificially precise.

Real Squish results will vary:
- **SQLite + FTS5**: Likely lower due to text-based search (not semantic)
- **PostgreSQL + pgvector**: Should be comparable to mock (uses same vector approach)

This is the **correct** architecture that matches production Squish.
