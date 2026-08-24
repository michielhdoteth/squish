/**
 * Batch 4 embedding storage backfill.
 *
 * Converts legacy JSON-text embeddings (embedding_json) into compact
 * little-endian float32 blobs (embedding_blob), L2-normalizing on the way so
 * cosine similarity == dot product for every migrated row.
 *
 * Idempotence: a row is "pending" iff embedding_blob IS NULL AND
 * embedding_json IS NOT NULL - the NULL check IS the marker, and the partial
 * index below keeps the pending check O(pending) instead of O(table) on
 * every boot after migration completes. Re-running converts nothing.
 */

import type { Database } from 'better-sqlite3';
import { encodeEmbeddingBlob, normalizeForStorage } from '../../core/lib/embedding-codec.js';
import { logger } from '../../core/logger.js';

const BATCH_SIZE = 500;

export interface BlobBackfillResult {
  converted: number;
  failed: number;
  pendingAfter: number;
}

/** Parse a stored JSON embedding; returns null when absent or malformed. */
function parseJsonEmbedding(raw: unknown): number[] | null {
  if (raw == null) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    if (typeof arr[0] !== 'number') return null;
    return arr as number[];
  } catch {
    return null;
  }
}

export async function runEmbeddingBlobBackfill(sqlite: Database): Promise<BlobBackfillResult> {
  // Partial index over exactly the pending rows: doubles as the idempotency
  // marker query (count is ~0 once migrated) and speeds the batch SELECT.
  sqlite.exec(
    'CREATE INDEX IF NOT EXISTS idx_memories_pending_embedding_blob ' +
    'ON memories(id) WHERE embedding_blob IS NULL AND embedding_json IS NOT NULL'
  );

  const result: BlobBackfillResult = { converted: 0, failed: 0, pendingAfter: 0 };

  const countStmt = sqlite.prepare(
    'SELECT COUNT(*) AS c FROM memories WHERE embedding_blob IS NULL AND embedding_json IS NOT NULL'
  );
  const pendingCount = (countStmt.get() as { c: number }).c;
  if (pendingCount === 0) {
    return result;
  }

  logger.info(`[embedding-backfill] converting ${pendingCount} memory embedding(s) from JSON to blob format`);

  const selectPageStmt = sqlite.prepare(
    'SELECT id, embedding_json AS embeddingJson FROM memories ' +
    'WHERE embedding_blob IS NULL AND embedding_json IS NOT NULL AND id > ? ' +
    'ORDER BY id LIMIT ?'
  );
  const updateStmt = sqlite.prepare(
    'UPDATE memories SET embedding_blob = ?, embedding_dim = ? WHERE id = ?'
  );

  let lastId = '';
  for (;;) {
    const rows = selectPageStmt.all(lastId, BATCH_SIZE) as Array<{ id: string; embeddingJson: unknown }>;
    if (rows.length === 0) break;

    const batchConverted = sqlite.transaction(() => {
      let n = 0;
      for (const row of rows) {
        lastId = row.id;
        const vector = parseJsonEmbedding(row.embeddingJson);
        if (!vector) {
          result.failed += 1;
          continue;
        }
        const blob = encodeEmbeddingBlob(normalizeForStorage(vector));
        if (!blob) {
          result.failed += 1;
          continue;
        }
        updateStmt.run(blob, vector.length, row.id);
        n += 1;
      }
      return n;
    })();
    result.converted += batchConverted;

    if (rows.length < BATCH_SIZE) break;
  }

  result.pendingAfter = (countStmt.get() as { c: number }).c;

  if (result.converted > 0 || result.failed > 0) {
    logger.info(
      `[embedding-backfill] done: ${result.converted} converted, ${result.failed} unparseable, ${result.pendingAfter} still pending`
    );
  }

  return result;
}
