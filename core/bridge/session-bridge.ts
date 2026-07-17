/**
 * Session-to-Permanent Memory Bridge
 *
 * Connects session-captured signals to the permanent knowledge graph.
 * When a session ends, durable session memories get their entities
 * extracted and linked to the permanent knowledge graph via the
 * graph builder and association layer.
 *
 * Flow:
 *   1. Query memories tagged with squish_session:<sessionId>
 *   2. Filter for durable classifications (durable-distilled, durable-raw+distilled)
 *   3. Run entity extraction on each via addMemoryToGraph
 *   4. Create inter-memory associations via autoLinkByEntities
 *   5. Return bridge statistics
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { getOrCreateProject } from '../projects.js';
import { addMemoryToGraph } from '../graph/graph-builder.js';
import { autoLinkByEntities } from '../associations.js';
import { deserializeMetadata } from '../memory/serialization.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal row shape for memory queries in this module. */
interface MemoryRow {
  id: string;
  projectId: string | null;
  content: string;
  metadata: unknown;
  tags: string[] | null;
  createdAt: Date;
}

export interface BridgeOptions {
  project?: string;
  dryRun?: boolean;
  onProgress?: (progress: BridgeProgress) => void;
}

export interface BridgeResult {
  sessionId: string;
  memoriesBridged: number;
  entitiesDiscovered: number;
  relationsFormed: number;
  associationsCreated: number;
  errors: number;
  durationMs: number;
}

export interface BridgeStats {
  totalBridged: number;
  lastBridgeAt: string | null;
  bridgedBySession: Record<string, number>;
}

export interface BridgeProgress {
  phase: 'scan' | 'extract' | 'link' | 'done';
  current: number;
  total: number;
  memoryId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DURABLE_CLASSIFICATIONS = new Set([
  'durable-distilled',
  'durable-raw+distilled',
]);

const SESSION_TAG_PREFIX = 'squish_session:';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape wildcard characters for SQL LIKE patterns. */
function escapeLike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Deserialize a memory row's metadata field into a record.
 * Handles both raw JSON (PG jsonb / SQLite text) and already-parsed objects.
 */
function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    return deserializeMetadata(raw);
  }
  return null;
}

/**
 * Determine the signal classification from a memory's metadata.
 * Checks both the current (metadata.signal.classification) and
 * legacy (metadata.classification) paths.
 */
function getClassification(
  metadata: Record<string, unknown> | null
): string | null {
  if (!metadata) return null;

  // Current path: metadata.signal.classification
  const signal = metadata.signal;
  if (signal && typeof signal === 'object') {
    const cls = (signal as Record<string, unknown>).classification;
    if (typeof cls === 'string') return cls;
  }

  // Legacy path: metadata.classification
  const legacy = metadata.classification;
  if (typeof legacy === 'string') return legacy;

  return null;
}

/**
 * Check if a memory has the session tag matching the given session ID.
 */
function hasSessionTag(memory: MemoryRow, sessionId: string): boolean {
  const tags = memory.tags;
  if (!tags || !Array.isArray(tags)) return false;
  const target = `${SESSION_TAG_PREFIX}${sessionId}`;
  return tags.some((t: string) => t === target);
}

/**
 * Extract entity names from a memory's metadata graphHint or by
 * returning an empty array (the graph builder handles extraction).
 */
function extractEntityNames(
  metadata: Record<string, unknown> | null
): string[] {
  if (!metadata) return [];
  const graphHint = metadata.graphHint;
  if (graphHint && typeof graphHint === 'object') {
    const terms = (graphHint as Record<string, unknown>).entityTerms;
    if (Array.isArray(terms)) {
      return terms.filter((t): t is string => typeof t === 'string');
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bridge durable session memories to the permanent knowledge graph.
 *
 * Queries memories tagged with squish_session:<sessionId> whose
 * signalClassification is 'durable-distilled' or 'durable-raw+distilled',
 * then runs entity extraction and association linking for each.
 */
export async function bridgeSessionToGraph(
  sessionId: string,
  options?: BridgeOptions
): Promise<BridgeResult> {
  const startTime = Date.now();
  const result: BridgeResult = {
    sessionId,
    memoriesBridged: 0,
    entitiesDiscovered: 0,
    relationsFormed: 0,
    associationsCreated: 0,
    errors: 0,
    durationMs: 0,
  };

  const dryRun = options?.dryRun ?? false;
  const onProgress = options?.onProgress;

  try {
    const db = await getDb();
    const schema = await getSchema();

    // Resolve project
    let projectId: string | null = null;
    if (options?.project) {
      const project = await getOrCreateProject(options.project);
      if (project) {
        projectId = project.id;
      }
    }

    // ------------------------------------------------------------------
    // Phase: scan - find durable session memories
    // ------------------------------------------------------------------
    onProgress?.({ phase: 'scan', current: 0, total: 0 });

    const sessionTag = `${SESSION_TAG_PREFIX}${sessionId}`;

    // Build the query: select memories tagged with this session.
    // Use LIKE on the tags column which works for both PG array (serialized)
    // and SQLite text representations.
    const conditions = [];
    if (projectId) {
      conditions.push(eq(schema.memories.projectId, projectId));
    }
    conditions.push(sql`CAST(${schema.memories.tags} AS TEXT) LIKE ${`%${escapeLike(sessionTag)}%`} ESCAPE '\\'`);

    const rows = await (db as any)
      .select()
      .from(schema.memories)
      .where(and(...conditions));

    logger.info('Session bridge: scanned memories', {
      sessionId,
      projectPath: options?.project ?? null,
      totalMatched: rows.length,
    });

    // Filter for durable classifications
    const durableMemories: MemoryRow[] = [];
    for (const row of rows) {
      if (!hasSessionTag(row, sessionId)) continue;

      const metadata = parseMetadata(row.metadata);
      const classification = getClassification(metadata);

      if (classification && DURABLE_CLASSIFICATIONS.has(classification)) {
        durableMemories.push(row);
      }
    }

    logger.info('Session bridge: durable memories identified', {
      sessionId,
      durableCount: durableMemories.length,
      ofTotal: rows.length,
    });

    onProgress?.({
      phase: 'scan',
      current: durableMemories.length,
      total: durableMemories.length,
    });

    if (durableMemories.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    if (dryRun) {
      result.memoriesBridged = durableMemories.length;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // ------------------------------------------------------------------
    // Phase: extract - add each durable memory to the graph
    // ------------------------------------------------------------------
    let entitiesDiscovered = 0;
    let relationsFormed = 0;
    let errors = 0;

    for (let i = 0; i < durableMemories.length; i++) {
      const memory = durableMemories[i];

      onProgress?.({
        phase: 'extract',
        current: i + 1,
        total: durableMemories.length,
        memoryId: memory.id,
      });

      try {
        const graphStats = await addMemoryToGraph(memory.id);
        entitiesDiscovered += graphStats.entitiesCreated;
        relationsFormed += graphStats.relationsCreated;
      } catch (error) {
        logger.error('Session bridge: failed to add memory to graph', {
          memoryId: memory.id,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }

    result.entitiesDiscovered = entitiesDiscovered;
    result.relationsFormed = relationsFormed;

    // ------------------------------------------------------------------
    // Phase: link - create associations between bridged memories
    // ------------------------------------------------------------------
    let associationsCreated = 0;

    for (let i = 0; i < durableMemories.length; i++) {
      const memory = durableMemories[i];

      onProgress?.({
        phase: 'link',
        current: i + 1,
        total: durableMemories.length,
        memoryId: memory.id,
      });

      try {
        const metadata = parseMetadata(memory.metadata);
        const entityNames = extractEntityNames(metadata);

        if (entityNames.length > 0 && memory.projectId) {
          const linked = await autoLinkByEntities(
            memory.id,
            entityNames,
            memory.projectId
          );
          associationsCreated += linked;
        }
      } catch (error) {
        logger.error('Session bridge: failed to create associations', {
          memoryId: memory.id,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }

    result.associationsCreated = associationsCreated;
    result.errors = errors;

    // ------------------------------------------------------------------
    // Phase: done
    // ------------------------------------------------------------------
    onProgress?.({
      phase: 'done',
      current: durableMemories.length,
      total: durableMemories.length,
    });

    result.memoriesBridged = durableMemories.length;
    result.durationMs = Date.now() - startTime;

    logger.info('Session bridge: completed', {
      sessionId,
      memoriesBridged: result.memoriesBridged,
      entitiesDiscovered: result.entitiesDiscovered,
      relationsFormed: result.relationsFormed,
      associationsCreated: result.associationsCreated,
      errors: result.errors,
      durationMs: result.durationMs,
    });

    return result;
  } catch (error) {
    logger.error('Session bridge: fatal error', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    result.errors++;
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Get statistics about bridged session memories.
 *
 * Scans all memories that have been bridged (contain the
 * squish_session tag and are durable) and aggregates stats.
 */
export async function getBridgeStats(
  projectPath: string
): Promise<BridgeStats> {
  const stats: BridgeStats = {
    totalBridged: 0,
    lastBridgeAt: null,
    bridgedBySession: {},
  };

  try {
    const db = await getDb();
    const schema = await getSchema();

    // Resolve project
    const project = await getOrCreateProject(projectPath);
    if (!project) {
      return stats;
    }

    // Fetch all memories for the project that contain session tags
    const rows = await (db as any)
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.projectId, project.id),
          sql`CAST(${schema.memories.tags} AS TEXT) LIKE ${`%${SESSION_TAG_PREFIX}%`}`
        )
      );

    // Filter for durable session memories and aggregate stats
    let lastBridgeAt: Date | null = null;
    const bySession: Record<string, number> = {};

    for (const row of rows) {
      const tags = row.tags;
      if (!tags || !Array.isArray(tags)) continue;

      // Find the session tag
      const sessionTag = tags.find(
        (t: string) => typeof t === 'string' && t.startsWith(SESSION_TAG_PREFIX)
      );
      if (!sessionTag) continue;

      // Check durability
      const metadata = parseMetadata(row.metadata);
      const classification = getClassification(metadata);
      if (!classification || !DURABLE_CLASSIFICATIONS.has(classification)) continue;

      // Extract session ID from the tag
      const sid = sessionTag.slice(SESSION_TAG_PREFIX.length);
      bySession[sid] = (bySession[sid] || 0) + 1;
      stats.totalBridged++;

      // Track the most recent bridged memory
      const createdAt = row.createdAt;
      if (createdAt instanceof Date && (!lastBridgeAt || createdAt > lastBridgeAt)) {
        lastBridgeAt = createdAt;
      }
    }

    stats.lastBridgeAt = lastBridgeAt ? lastBridgeAt.toISOString() : null;
    stats.bridgedBySession = bySession;

    return stats;
  } catch (error) {
    logger.error('Bridge stats: error computing stats', {
      projectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return stats;
  }
}
