# Squish v0.0.1 Benchmark Results

## Actual Performance (PostgreSQL + Redis)

```
Squish Performance Benchmark
======================================================================
Database Operations
----------------------------------------------------------------------
Insert (single)                   286 ops/sec   | 3.49ms avg
Insert (bulk 10)                  173 ops/sec   | 5.78ms avg  (1,730 records/sec)
Select by ID                      793 ops/sec   | 1.26ms avg
Search (ILIKE)                    819 ops/sec   | 1.22ms avg
Search (filtered)                 518 ops/sec   | 1.93ms avg
Count                             115 ops/sec   | 8.72ms avg
----------------------------------------------------------------------
Database avg:                     451 ops/sec

Cache Operations (Redis)
----------------------------------------------------------------------
Redis SET                       2,796 ops/sec   | 0.36ms avg
Redis GET                       3,606 ops/sec   | 0.28ms avg
Redis SETEX (TTL)               3,218 ops/sec   | 0.31ms avg
----------------------------------------------------------------------
Cache avg:                      3,207 ops/sec

In-Memory Operations (Bun)
----------------------------------------------------------------------
Map SET                       449,834 ops/sec   | 0.22ms per 100k
Map GET                     3,157,281 ops/sec   | 0.03ms per 100k
JSON.stringify                409,490 ops/sec
JSON.parse                    368,668 ops/sec
UUID generation             1,884,640 ops/sec
Regex match                 2,711,982 ops/sec
----------------------------------------------------------------------
```

## Feature Comparison

| Feature | Squish v0.0.1 | Claude-Mem v9.0.4 |
|---------|---------------|-------------------|
| **Storage** | PostgreSQL + pgvector | SQLite + Chroma |
| **Caching** | Redis | In-memory |
| **Search** | Keyword (pgvector ready) | Hybrid semantic + keyword |
| **Tools** | 8 | 3 |
| **License** | MIT | AGPL-3.0 |

## Code Size

| Metric | Squish | Claude-Mem |
|--------|--------|------------|
| MCP server | 465 lines | ~2000+ lines |
| Database layer | 360 lines | ~500 lines |
| Total (core) | ~906 lines | ~3000+ lines |

## Architecture

### Squish
```
Client → MCP Server → Drizzle ORM → PostgreSQL (pgvector)
                   ↘ Redis Cache
```

### Claude-Mem
```
Client → MCP Server → Worker (Bun) → SQLite + Chroma → Web UI
```

## Trade-offs

### Squish Advantages
- Simpler codebase (906 vs 3000+ lines)
- PostgreSQL scales to 10M+ records
- MIT license (more permissive)
- Redis for distributed caching
- Production-ready infrastructure

### Claude-Mem Advantages
- Local-first (no external services)
- Semantic search via Chroma
- Web UI for viewing
- Progressive disclosure pattern
- More mature (v9.0.4)

## Conclusion

Squish prioritizes scalability and production readiness over local simplicity. Better for teams and large projects where PostgreSQL infrastructure already exists.

## Run Benchmarks

```bash
# In-memory benchmark (no deps)
bun run bench

# Database benchmark (requires docker)
docker compose up -d
bun run db:push
bun run bench:db
```
