# Squish v0.9.0 - Complete System Flow & Competitive Guide

## Memory System Flow

### 1. Write Path (When Agent Stores a Memory)

```
User/Agent Input
       |
       v
[Trigger Detector] ----> Detects: "remember", "important", corrections
       |
       v
[Write Gate] ----> Validates: secrets, length, quality score
       |
       v
[Contradiction Resolver] ----> Checks for conflicts, marks superseded
       |
       v
[Memory Storage] ----> SQLite/PostgreSQL with embedding
       |
       v
[Telemetry] ----> Tracks for future quality improvement
```

**Flow Steps:**
1. Content analyzed for triggers (explicit: "remember", implicit: decisions)
2. Secrets detected and redacted if found
3. Quality score calculated (0-100)
4. Contradictions detected, old memories auto-superseded
5. Memory stored with metadata (type, priority, confidence)
6. Embedding generated (local TF-IDF or provider)

### 2. Read Path (When Agent Recalls Memories)

```
Search Query
       |
       v
[Vector Search] ----> Semantic similarity
       |
       v
[BM25 Search] ----> Keyword matching
       |
       v
[RRF Fusion] ----> Combine results
       |
       v
[Hybrid Scorer] ----> Multi-factor ranking:
|                    - Semantic (35%)
|                    - Recency (25%)
|                    - Coactivation (20%)
|                    - Importance (20%)
       |
       v
[Entity Boost] ----> Rerank by entity relevance
       |
       v
[Telemetry Boost] ----> Boost by echo/fizzle history
       |
       v
Top Results Returned
```

### 3. Lifecycle Flow (Background Jobs)

```
Worker Timer (1 hour)
       |
       v
[Decay Job] ----> Reduce importance of old memories
       |
       v
[Tier Update] ----> hot -> warm -> cold progression
       |
       v
[Eviction] ----> Remove cold, low-relevance, old memories
       |
       v
[Dedup Job] ----> Find and merge duplicates (12h)
       |
       v
[Consolidation] ----> Summarize clusters (24h)
```

---

## Competitive Advantages vs Alternatives

### vs Claude-mem (31.8k stars, AGPL-3.0)

| Feature | Squish | Claude-mem |
|---------|--------|------------|
| License | MIT (permissive) | AGPL-3.0 (copyleft) |
| CLI Fallback | Yes - graceful degradation | No |
| Memory Intelligence | Trigger detection, contradiction resolution | Progressive disclosure |
| Multi-client | Universal MCP | Claude Code only |
| Commercial use | Allowed | Restricted |

**Our Wedge:** "Use anywhere, fork freely, no vendor lock-in"

### vs Supermemory (16.7k stars, MIT)

| Feature | Squish | Supermemory |
|---------|--------|-------------|
| Deployment | Local-first | SaaS-first |
| Data ownership | 100% local | Cloud-dependent |
| Offline mode | Full support | Limited |
| Knowledge graph | Association graph | Full graph |
| Reranking | Hybrid scorer | External reranker |

**Our Wedge:** "Own your memory, work offline, no subscription"

### vs OpenClaw Memory

| Feature | Squish | OpenClaw |
|---------|--------|----------|
| Scope | Universal MCP | OpenClaw-only |
| Embeddings | Multiple providers | QMD backend |
| CLI | Standalone | Integrated |
| Memory types | 5 types + core memory | File-based markdown |

**Our Wedge:** "Works everywhere, not just OpenClaw"

---

## Security & Edge Cases

### Security Measures

1. **Secret Detection** (`core/secret-detector.ts`)
   - API keys, tokens, passwords detected
   - Auto-redact before storage
   - Write gate blocks secrets by default

2. **Content Validation** (`core/memory/write-gate.ts`)
   - Min/max length checks
   - Binary content detection
   - Excessive repetition detection

3. **No Raw Shell Access**
   - Agents use MCP tools only
   - No docker ps, docker exec exposure
   - Sandctioned operations only

### Edge Cases Handled

1. **Database Unavailable**
   ```typescript
   // Graceful degradation in db/index.ts
   if (isDatabaseUnavailableError(error)) {
     return []; // Return empty, don't crash
   }
   ```

2. **MCP Server Failure**
   ```bash
   # CLI fallback mode
   squish remember "text"  # Works without MCP
   squish search "query"   # Works without MCP
   ```

3. **Bun vs Node Runtime**
   ```typescript
   // Auto-detect runtime in db/adapter.ts
   const isBun = typeof Bun !== 'undefined';
   // Use bun:sqlite or better-sqlite3 accordingly
   ```

4. **Empty Results**
   - All search functions return `[]` not null
   - No crashes on empty database

5. **Corrupted Embeddings**
   - Null-safe embedding parsing
   - Fallback to keyword search

### Known Issues & Fixes

| Issue | Fix |
|-------|-----|
| better-sqlite3 in Bun | Use bun:sqlite when available |
| API key prompts in local mode | Set `SQUISH_EMBEDDINGS_PROVIDER=local` |
| Hooks not working | Ensure `bun run build` completed |

---

## Installation & Setup

### For Claude Code

```bash
# Install globally
npm install -g squish-memory

# Or use npx
npx squish-memory --version
```

### For OpenClaw

```bash
# Add to OpenClaw MCP config
{
  "mcpServers": {
    "squish": {
      "command": "squish",
      "args": [],
      "env": {
        "SQUISH_MODE": "local",
        "SQUISH_EMBEDDINGS_PROVIDER": "local"
      }
    }
  }
}
```

### Environment Variables

```bash
# Required for local mode (zero setup)
SQUISH_MODE=local
SQUISH_EMBEDDINGS_PROVIDER=local

# Optional for better embeddings
SQUISH_EMBEDDINGS_PROVIDER=ollama
SQUISH_OLLAMA_URL=http://localhost:11434

# Optional for team mode
DATABASE_URL=postgresql://...
```

---

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| `core_memory` | View/edit always-visible memory |
| `context_paging` | Load/evict working memories |
| `remember` | Store new memory |
| `search` | Hybrid search |
| `recall` | Get by ID |
| `observe` | Record tool patterns |
| `context` | Get project context |
| `health` | System status |
| `set_importance` | Manual importance score |
| `pin_memory` | Prevent pruning |
| `consolidate` | Trigger summarization |

---

## Testing Your Installation

```bash
# Health check
squish health

# Store a memory
squish remember "Test memory"

# Search
squish search "test"

# Via MCP
# Use the health tool in Claude Code
```
