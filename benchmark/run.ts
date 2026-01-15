#!/usr/bin/env bun

/**
 * Squish Performance Benchmark
 *
 * Tests:
 * 1. Memory insertion speed
 * 2. Search performance (keyword)
 * 3. Bulk operations
 * 4. Cache hit/miss performance
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, ilike, desc, and } from 'drizzle-orm';
import { createClient } from 'redis';
import {
  pgTable, text, timestamp, uuid, integer, boolean, jsonb, index, vector
} from 'drizzle-orm/pg-core';

const { Pool } = pg;

// Schema (inline for standalone benchmark)
const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id'),
  type: text('type').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  tags: text('tags').array(),
  isActive: boolean('is_active').default(true),
  accessCount: integer('access_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Config
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://squish:squish_dev@localhost:5432/squish';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Results
interface BenchmarkResult {
  name: string;
  ops: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

const results: BenchmarkResult[] = [];

function formatResult(r: BenchmarkResult): string {
  return `${r.name.padEnd(30)} ${r.ops.toString().padStart(6)} ops | ${r.avgMs.toFixed(3).padStart(8)}ms avg | ${r.opsPerSec.toFixed(0).padStart(8)} ops/sec`;
}

async function benchmark(name: string, ops: number, fn: () => Promise<void>): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < Math.min(10, ops); i++) {
    await fn();
  }

  const start = performance.now();
  for (let i = 0; i < ops; i++) {
    await fn();
  }
  const totalMs = performance.now() - start;

  const result: BenchmarkResult = {
    name,
    ops,
    totalMs,
    avgMs: totalMs / ops,
    opsPerSec: (ops / totalMs) * 1000,
  };

  results.push(result);
  console.log(formatResult(result));
  return result;
}

async function main() {
  console.log('Squish Performance Benchmark');
  console.log('='.repeat(70));
  console.log();

  // Connect to database
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let redis: ReturnType<typeof createClient>;

  try {
    pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
    db = drizzle(pool);
    console.log('✓ PostgreSQL connected');
  } catch (e) {
    console.log('✗ PostgreSQL not available - skipping DB benchmarks');
    console.log('  Run: docker-compose up -d');
    process.exit(1);
  }

  try {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log('✓ Redis connected');
  } catch (e) {
    console.log('✗ Redis not available - skipping cache benchmarks');
  }

  console.log();
  console.log('Running benchmarks...');
  console.log('-'.repeat(70));

  // Test data
  const testContent = 'This is a test memory content for benchmarking purposes.';
  const testTags = ['test', 'benchmark'];

  // 1. Single insert
  await benchmark('Insert (single)', 100, async () => {
    await db.insert(memories).values({
      type: 'observation',
      content: testContent,
      tags: testTags,
    });
  });

  // 2. Bulk insert
  await benchmark('Insert (bulk 10)', 50, async () => {
    const batch = Array(10).fill(null).map(() => ({
      type: 'observation',
      content: testContent,
      tags: testTags,
    }));
    await db.insert(memories).values(batch);
  });

  // 3. Select by ID
  const [sample] = await db.insert(memories).values({
    type: 'fact',
    content: 'Sample for select benchmark',
  }).returning();

  await benchmark('Select by ID', 500, async () => {
    await db.select().from(memories).where(eq(memories.id, sample.id));
  });

  // 4. Keyword search (ILIKE)
  await benchmark('Search (ILIKE)', 200, async () => {
    await db.select().from(memories)
      .where(ilike(memories.content, '%test%'))
      .limit(10);
  });

  // 5. Search with filters
  await benchmark('Search (filtered)', 200, async () => {
    await db.select().from(memories)
      .where(and(
        eq(memories.isActive, true),
        ilike(memories.content, '%benchmark%')
      ))
      .orderBy(desc(memories.updatedAt))
      .limit(10);
  });

  // 6. Count
  await benchmark('Count', 200, async () => {
    await db.select().from(memories).where(eq(memories.type, 'observation'));
  });

  // Redis benchmarks
  if (redis) {
    console.log('-'.repeat(70));

    // 7. Cache set
    await benchmark('Redis SET', 1000, async () => {
      await redis.set('bench:key', JSON.stringify({ data: testContent }));
    });

    // 8. Cache get
    await redis.set('bench:cached', JSON.stringify({ data: testContent }));
    await benchmark('Redis GET', 1000, async () => {
      await redis.get('bench:cached');
    });

    // 9. Cache set with TTL
    await benchmark('Redis SETEX (TTL)', 1000, async () => {
      await redis.setEx('bench:ttl', 300, JSON.stringify({ data: testContent }));
    });

    await redis.quit();
  }

  // Cleanup
  await db.delete(memories).where(ilike(memories.content, '%benchmark%'));
  await db.delete(memories).where(eq(memories.id, sample.id));
  await pool.end();

  // Summary
  console.log();
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('-'.repeat(70));

  const dbResults = results.filter(r => !r.name.startsWith('Redis'));
  const cacheResults = results.filter(r => r.name.startsWith('Redis'));

  if (dbResults.length) {
    const avgDbOps = dbResults.reduce((a, b) => a + b.opsPerSec, 0) / dbResults.length;
    console.log(`Database avg: ${avgDbOps.toFixed(0)} ops/sec`);
  }

  if (cacheResults.length) {
    const avgCacheOps = cacheResults.reduce((a, b) => a + b.opsPerSec, 0) / cacheResults.length;
    console.log(`Cache avg:    ${avgCacheOps.toFixed(0)} ops/sec`);
  }

  console.log();
  console.log('Done.');
}

main().catch(console.error);
