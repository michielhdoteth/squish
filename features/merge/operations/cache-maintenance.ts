/**
 * Hash cache maintenance operations
 *
 * Updates and maintains SimHash/MinHash signatures for efficient duplicate detection
 */

import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq } from 'drizzle-orm';
import { SimHashFilter, MinHashFilter } from '../detection/hash-filters.js';
import crypto from 'crypto';

/**
 * Calculate MD5 hash of content for cache invalidation
 */
function calculateContentHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Update or create hash cache entry for a single memory
 */
export async function updateMemoryHashCache(memoryId: string): Promise<boolean> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Load the memory
    const [memory] = await db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId));

    if (!memory) {
      return false;
    }

    // Generate hashes
    const simhashFilter = new SimHashFilter();
    const minhashFilter = new MinHashFilter();

    const simhash = simhashFilter.generateHash(memory.content);
    const minhash = minhashFilter.generateSignature(memory.content);
    const contentHash = calculateContentHash(memory.content);

    // Upsert cache entry
    const now = new Date();

    // Check if entry exists
    const [existing] = await db
      .select()
      .from(schema.memoryHashCache)
      .where(eq(schema.memoryHashCache.memoryId, memoryId));

    if (existing) {
      // Update existing
      await db
        .update(schema.memoryHashCache)
        .set({
          simhash,
          minhash: minhash,
          contentHash,
          lastUpdated: now,
        })
        .where(eq(schema.memoryHashCache.memoryId, memoryId));
    } else {
      // Create new
      await db.insert(schema.memoryHashCache).values({
        memoryId,
        projectId: memory.projectId,
        simhash,
        minhash: minhash,
        contentHash,
        lastUpdated: now,
      } as any);
    }

    return true;
  } catch (error) {
    console.error(`[squish-merge] Failed to update hash cache for ${memoryId}:`, error);
    return false;
  }
}

/**
 * Rebuild hash cache for an entire project
 * Useful for initialization or recovery
 */
export async function rebuildProjectHashCache(projectId: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Get all memories in project
    const memories: any[] = await db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.projectId, projectId));

    let succeeded = 0;
    let failed = 0;

    for (const memory of memories) {
      const ok = await updateMemoryHashCache(memory.id);
      if (ok) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      processed: memories.length,
      succeeded,
      failed,
    };
  } catch (error) {
    console.error(`[squish-merge] Failed to rebuild hash cache for project ${projectId}:`, error);
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

/**
 * Check if hash cache entry is stale and needs refresh
 * Entry is stale if content hash doesn't match
 */
export async function isHashCacheStale(memoryId: string): Promise<boolean> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    const [memory] = await db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId));

    if (!memory) {
      return true;
    }

    const [cacheEntry] = await db
      .select()
      .from(schema.memoryHashCache)
      .where(eq(schema.memoryHashCache.memoryId, memoryId));

    if (!cacheEntry) {
      return true; // No cache entry = stale
    }

    const currentContentHash = calculateContentHash(memory.content);
    return currentContentHash !== cacheEntry.contentHash;
  } catch (error) {
    console.error(`[squish-merge] Failed to check hash cache staleness:`, error);
    return true; // Assume stale on error
  }
}

/**
 * Clean up hash cache for non-existent memories
 */
export async function cleanupOrphanedHashCache(projectId: string): Promise<number> {
  try {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Get all cache entries for project
    const cacheEntries: any[] = await db
      .select()
      .from(schema.memoryHashCache)
      .where(eq(schema.memoryHashCache.projectId, projectId));

    let deleted = 0;

    for (const entry of cacheEntries) {
      // Check if memory exists
      const [memory] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, entry.memoryId));

      if (!memory) {
        // Memory doesn't exist, delete cache entry
        await db
          .delete(schema.memoryHashCache)
          .where(eq(schema.memoryHashCache.memoryId, entry.memoryId));
        deleted++;
      }
    }

    return deleted;
  } catch (error) {
    console.error(`[squish-merge] Failed to cleanup orphaned hash cache:`, error);
    return 0;
  }
}
