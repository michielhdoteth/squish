# Real Squish Integration - Complete Summary

## What Was Wrong

The benchmark was using a **mock Squish implementation** that didn't match the real architecture:

| Aspect | Mock (Old) | Real Squish (Correct) |
|--------|-----------|----------------------|
| Storage | In-memory `Map` | SQLite file or PostgreSQL |
| Search | Cosine similarity on embeddings | **FTS5** (SQLite) or **pgvector** (PostgreSQL) |
| Embeddings | Always Ollama | Configurable: TF-IDF/Ollama/OpenAI |
| Persistence | None (lost on restart) | Persistent |

## Changes Made

### 1. Updated Provider (`src/providers/squish-claude.ts`)
- Uses **actual Squish core** imports:
  - `squish/core/memory/memories.js` - `rememberMemory()` and `searchMemories()`
  - `squish/db/index.js` - Database connection
  - `squish/config.js` - Mode detection (SQLite vs PostgreSQL)
  - `drizzle-orm` - SQL operators
- Dynamically imports from parent `../squish` directory
- Calls **real** Squish functions, not mocks

### 2. Updated Runner (`src/pipeline/runner-claude.ts`)
- Removed Ollama checks (embeddings now handled by Squish config)
- Uses real provider for ingestion and search
- Fixed checkpoint status types

### 3. Updated CLI (`src/index.ts`)
- Simplified `run-claude` command (removed --embed option)
- Embeddings now controlled by Squish config, not CLI args

### 4. Fixed TypeScript Errors
- Added `drizzle-orm` dependency to benchmark
- Fixed sample data type annotations in benchmark files
- Fixed status type errors in runners
- Added optional `getSessionById` to BenchmarkDataset interface

## How It Works Now

### SQLite Mode (Default - Local)
```bash
# Uses FTS5 for text search (NOT vector similarity)
export SQUISH_DATA_DIR=./.squish
bun run src/index.ts run-claude
```

**Search uses FTS5:**
```sql
SELECT * FROM memories 
JOIN memories_fts ON memories_fts.rowid = memories.rowid
WHERE memories_fts MATCH ?
ORDER BY created_at DESC
```

### PostgreSQL Mode (Team - Vector Search)
```bash
# Uses pgvector for cosine similarity
export DATABASE_URL=postgres://squish:squish_dev@localhost:5432/squish
export SQUISH_EMBEDDINGS_PROVIDER=ollama
bun run src/index.ts run-claude
```

**Search uses pgvector:**
```sql
SELECT *, embedding <-> $1 as distance
FROM memories
ORDER BY embedding <-> $1
LIMIT $2
```

## Verification

When running, you'll see:
```
📦 Initializing REAL Squish core...
✅ Squish mode: local (SQLite + FTS5)
✅ Database connected
```

Or for PostgreSQL:
```
✅ Squish mode: team (PostgreSQL + pgvector)
```

## Architecture Comparison

### Before (Mock)
```typescript
// Fake implementation
class MockSquishProvider {
  private memories = new Map<string, Memory>();
  
  async search(query: string) {
    // Vector similarity - NOT how real Squish works!
    return Array.from(this.memories.values())
      .map(m => ({ score: cosineSimilarity(embedding, m.embedding) }))
      .sort((a, b) => b.score - b.score);
  }
}
```

### After (Real)
```typescript
// Real implementation
class SquishClaudeProvider {
  async search(query: string) {
    // Calls ACTUAL Squish - uses FTS5 or pgvector
    return await squishModule.searchMemories({
      query,
      project: this.project,
    });
  }
}
```

## Files Modified

1. `src/providers/squish-claude.ts` - Real Squish integration
2. `src/pipeline/runner-claude.ts` - Updated to use real provider
3. `src/index.ts` - Simplified CLI
4. `src/types/index.ts` - Added optional method
5. `package.json` - Added drizzle-orm dependency
6. `src/benchmarks/locomo.ts` - Fixed types
7. `src/benchmarks/convomem.ts` - Fixed types
8. `src/benchmarks/longmemeval.ts` - Fixed types
9. `src/pipeline/runner-local.ts` - Fixed status type
10. `src/pipeline/runner-v2.ts` - Fixed status type
11. `src/pipeline/test.ts` - Fixed optional method call

## Expected Results

- **SQLite + FTS5**: Results will differ from mock (text search vs vector similarity)
- **PostgreSQL + pgvector**: Should be comparable to mock (both use vector similarity)

This is now a **real** benchmark of the actual Squish architecture.
