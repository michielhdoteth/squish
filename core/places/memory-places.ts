/**
 * Memory-Place Assignments - Assign memories to places
 * 
 * Handles the assignment of memories to places, both:
 * - Auto-assignment via rules
 * - Manual assignment by users
 */

import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { getPlaceByType, updatePlaceMemoryCount } from './places.js';
import { findMatchingPlace } from './rules.js';
import type { PlaceType } from './places.js';
import type { PlaceCandidate } from './rules.js';

/**
 * Assign a memory to a place (auto or manual)
 * Backward-compatible function that accepts placeId and maps to new schema columns
 */
export async function assignMemoryToPlace(params: {
  memoryId: string;
  placeId: string;
  isManual?: boolean;
  ruleId?: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Resolve placeId to placeType by looking up the place record
  let placeType = 'inbox';
  try {
    const placeRows = await sqliteDb.select()
      .from(schema.places)
      .where(eq(schema.places.id, params.placeId))
      .limit(1);
    if (placeRows.length > 0) {
      placeType = placeRows[0].placeType || placeRows[0].place_type || 'inbox';
    }
  } catch {
    // Fallback: try raw SQL
    try {
      const row = sqliteDb.$client.prepare('SELECT place_type FROM places WHERE id = ?').get(params.placeId);
      if (row) placeType = row.place_type || 'inbox';
    } catch {
      // Use default inbox
    }
  }

  const source = params.isManual ? 'manual' : 'heuristic';

  // Remove existing assignments for this memory (both manual and heuristic)
  try {
    await sqliteDb.delete(schema.memoryPlaces)
      .where(eq(schema.memoryPlaces.memoryId, params.memoryId));
  } catch {
    try {
      sqliteDb.$client.exec(`DELETE FROM memory_places WHERE memory_id = '${params.memoryId}'`);
    } catch {
      // Ignore
    }
  }

  // Insert new assignment with new schema columns
  try {
    await sqliteDb.insert(schema.memoryPlaces).values({
      id: randomUUID(),
      memoryId: params.memoryId,
      placeType,
      weight: 1.0,
      reason: null,
      source,
      isPrimary: true,
    }).onConflictDoNothing();
  } catch {
    // Fallback to raw SQL
    try {
      sqliteDb.$client.exec(
        `INSERT OR IGNORE INTO memory_places (id, memory_id, place_type, weight, reason, source, is_primary)
         VALUES ('${randomUUID()}', '${params.memoryId}', '${placeType}', 1.0, NULL, '${source}', 1)`
      );
    } catch (e) {
      logger.debug(`[MemoryPlaces] Failed to insert place: ${e}`);
      return false;
    }
  }

  // Update memory's placeId reference (for backward compat) and primaryPlace
  try {
    await sqliteDb.update(schema.memories)
      .set({ placeId: params.placeId })
      .where(eq(schema.memories.id, params.memoryId));
  } catch {
    // Ignore - column might not exist in drizzle schema
  }

  // Update primaryPlace on the memories table
  try {
    sqliteDb.$client.exec(
      `UPDATE memories SET primary_place = '${placeType}', place_type = '${placeType}' WHERE id = '${params.memoryId}'`
    );
  } catch {
    // Ignore
  }

  // Update place memory count
  await updatePlaceMemoryCount(params.placeId);

  logger.debug(`[MemoryPlaces] Assigned memory ${params.memoryId} to place ${params.placeId} (${placeType})`);
  return true;
}

/**
 * Auto-assign a memory based on rules
 */
export async function autoAssignMemory(params: {
  memoryId: string;
  projectId: string;
  toolName?: string;
  content?: string;
  tags?: string[];
  memoryType?: string;
}): Promise<{ assigned: boolean; placeId?: string; placeType?: PlaceType }> {
  const { memoryId, projectId, toolName, content, tags, memoryType } = params;

  // Find matching place via rules
  const placeType = await findMatchingPlace(projectId, {
    toolName,
    content,
    tags,
    memoryType,
  });

  if (!placeType) {
    logger.info(`[MemoryPlaces] No matching rule for memory ${memoryId}`);
    return { assigned: false };
  }

  // Get the place
  const place = await getPlaceByType(projectId, placeType);
  if (!place) {
    logger.warn(`[MemoryPlaces] Place not found: ${placeType}`);
    return { assigned: false };
  }

  // Assign
  const success = await assignMemoryToPlace({
    memoryId,
    placeId: place.id,
    isManual: false,
  });

  return {
    assigned: success,
    placeId: place.id,
    placeType,
  };
}

/**
 * Manually assign a memory to a place
 */
export async function manualAssignMemory(params: {
  memoryId: string;
  projectId: string;
  placeType: PlaceType;
}): Promise<boolean> {
  const { memoryId, projectId, placeType } = params;

  // Get the place by type
  const place = await getPlaceByType(projectId, placeType);
  if (!place) {
    logger.warn(`[MemoryPlaces] Place not found: ${placeType}`);
    return false;
  }

  return assignMemoryToPlace({
    memoryId,
    placeId: place.id,
    isManual: true,
  });
}

/**
 * Get place for a memory
 * Returns the placeId of the primary place assignment
 */
export async function getMemoryPlace(memoryId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const sqliteDb = db as any;
  const client = sqliteDb.$client || sqliteDb;

  try {
    // Get the place_type from memory_places for this memory
    const rows = client.prepare(
      'SELECT place_type FROM memory_places WHERE memory_id = ? LIMIT 1'
    ).all(memoryId);
    
    if (!rows || rows.length === 0) return null;
    
    const placeType = rows[0].place_type;
    if (!placeType) return null;
    
    // Resolve placeType to placeId by looking up the places table
    const placeRows = client.prepare(
      'SELECT id FROM places WHERE place_type = ? LIMIT 1'
    ).all(placeType);
    
    if (placeRows && placeRows.length > 0) {
      return placeRows[0].id;
    }
  } catch (e) {
    logger.debug(`[MemoryPlaces] getMemoryPlace failed: ${e}`);
  }

  return null;
}

/**
 * Get memories for a place
 */
export async function getPlaceMemories(placeIdOrType: string, limit: number = 50): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const sqliteDb = db as any;

  // Resolve placeId to placeType if needed (v1.5.0: memory_places uses place_type, not place_id)
  let placeType = placeIdOrType;
  try {
    const placeRow = sqliteDb.$client.prepare(
      'SELECT place_type FROM places WHERE id = ? OR place_type = ? LIMIT 1'
    ).get(placeIdOrType, placeIdOrType);
    if (placeRow) {
      placeType = placeRow.place_type || placeIdOrType;
    }
  } catch {
    // If places table lookup fails, assume it's already a placeType
  }

  try {
    const rows = sqliteDb.$client.prepare(
      'SELECT memory_id FROM memory_places WHERE place_type = ? AND weight >= 0.35 LIMIT ?'
    ).all(placeType, limit);
    return rows.map((r: any) => r.memory_id);
  } catch {
    return [];
  }
}

/**
 * Remove memory from place
 */
export async function removeMemoryFromPlace(memoryId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get the place before deleting
  const existing = await sqliteDb.select()
    .from(schema.memoryPlaces)
    .where(eq(schema.memoryPlaces.memoryId, memoryId))
    .limit(1);

  if (existing.length > 0) {
    const oldPlaceId = existing[0].place_id;
    
    // Delete assignment
    await sqliteDb.delete(schema.memoryPlaces)
      .where(eq(schema.memoryPlaces.memoryId, memoryId));

    // Clear memory's place reference
    await sqliteDb.update(schema.memories)
      .set({ placeId: null })
      .where(eq(schema.memories.id, memoryId));

    // Update old place memory count
    await updatePlaceMemoryCount(oldPlaceId);

    logger.info(`[MemoryPlaces] Removed memory ${memoryId} from place ${oldPlaceId}`);
  }

  return true;
}

/**
 * Initialize memory-place for a project (ensures all memories without places get assigned)
 */
export async function initializeProjectPlaces(projectId: string): Promise<{
  initialized: number;
  assigned: number;
}> {
  const db = await getDb();
  if (!db) return { initialized: 0, assigned: 0 };

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get all memories without a place_id
  const memoriesWithoutPlace = await sqliteDb.select({ id: schema.memories.id })
    .from(schema.memories)
    .where(and(
      eq(schema.memories.projectId, projectId),
    ));

  let assigned = 0;
  
  for (const mem of memoriesWithoutPlace) {
    const result = await autoAssignMemory({
      memoryId: mem.id,
      projectId,
      memoryType: 'observation',
    });
    
    if (result.assigned) assigned++;
  }

  logger.info(`[MemoryPlaces] Initialized places for project ${projectId}: ${assigned} assigned`);
  return { initialized: memoriesWithoutPlace.length, assigned };
}

/**
 * Process inbox memories - move memories from Inbox to more appropriate places
 * by running inferPlaceHintWithLLM on each inbox memory
 */
export async function processInbox(projectId: string): Promise<{
  processed: number;
  moved: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, moved: 0, errors: 0 };

  const schema = await getSchema();
  const sqliteDb = db as any;
  
  // Get the Inbox place for this project
  const inboxPlace = await getPlaceByType(projectId, 'inbox');
  if (!inboxPlace) {
    logger.warn(`[MemoryPlaces] Inbox place not found for project ${projectId}`);
    return { processed: 0, moved: 0, errors: 0 };
  }

  // Get all memory-place assignments for Inbox
  const inboxAssignments = await sqliteDb.select({
    memoryId: schema.memoryPlaces.memoryId,
    placeId: schema.memoryPlaces.placeId,
    isManual: schema.memoryPlaces.isManual,
  })
  .from(schema.memoryPlaces)
  .where(eq(schema.memoryPlaces.placeId, inboxPlace.id));

  if (inboxAssignments.length === 0) {
    return { processed: 0, moved: 0, errors: 0 };
  }

  // Filter out manually assigned memories
  const autoAssignedMemories = inboxAssignments
    .filter((m: any) => !m.isManual)
    .map((m: any) => m.memoryId);

  if (autoAssignedMemories.length === 0) {
    return { processed: 0, moved: 0, errors: 0 };
  }

  // Get the actual memories content
  const memories = await sqliteDb.select({
    id: schema.memories.id,
    content: schema.memories.content,
  })
  .from(schema.memories)
  .where(and(
    eq(schema.memories.projectId, projectId),
  ));

  // Filter only inbox memories that have content
  const inboxMemories = memories.filter((m: any) => autoAssignedMemories.includes(m.id));

  let moved = 0;
  let errors = 0;

  for (const mem of inboxMemories) {
    try {
      // Import and use the async place hint inference
      const { inferPlaceHintWithLLM } = await import('../ingestion/signal-engine.js');
      const placeHint = await inferPlaceHintWithLLM('', mem.content?.toLowerCase() || '', mem.content || '');
      
      if (placeHint.placeType && placeHint.placeType !== 'inbox') {
        // Find the target place
        const targetPlace = await getPlaceByType(projectId, placeHint.placeType);
        if (targetPlace) {
          await assignMemoryToPlace({
            memoryId: mem.id,
            placeId: targetPlace.id,
            isManual: false,
          });
          moved++;
          logger.info(`[MemoryPlaces] processInbox: moved memory ${mem.id} from inbox to ${placeHint.placeType}`);
        }
      }
    } catch (e) {
      logger.warn(`[MemoryPlaces] processInbox: error processing memory ${mem.id}: ${e}`);
      errors++;
    }
  }

  logger.info(`[MemoryPlaces] processInbox: processed ${inboxMemories.length}, moved ${moved}, errors ${errors}`);
  return { processed: inboxMemories.length, moved, errors };
}

/**
 * Process inbox for all projects
 */
export async function processInboxForAllProjects(): Promise<{
  totalProcessed: number;
  totalMoved: number;
  totalErrors: number;
}> {
  const { getAllProjects } = await import('../projects.js');
  const projects = await getAllProjects();
  
  let totalProcessed = 0;
  let totalMoved = 0;
  let totalErrors = 0;

  for (const project of projects) {
    try {
      const result = await processInbox(project.id);
      totalProcessed += result.processed;
      totalMoved += result.moved;
      totalErrors += result.errors;
    } catch (e) {
      logger.warn(`[MemoryPlaces] processInboxForAllProjects: error for project ${project.id}: ${e}`);
      totalErrors++;
    }
  }

  logger.info(`[MemoryPlaces] processInboxForAllProjects: processed ${totalProcessed}, moved ${totalMoved}, errors ${totalErrors}`);
  return { totalProcessed, totalMoved, totalErrors };
}

/**
 * Auto-archive old memories - move memories > 30 days from active places to Archive.
 * Also archives non-inbox/non-archive memories that haven't been accessed in 45+ days
 * with importance < 30.
 * Keeps active places lean and organized
 */
export async function autoArchiveOldMemories(projectId: string, daysOld: number = 30): Promise<{
  archived: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { archived: 0, failed: 0 };

  const schema = await getSchema();
  const sqliteDb = db as any;
  
  // Get the Archive place
  const archivePlace = await getPlaceByType(projectId, 'archive');
  if (!archivePlace) {
    logger.warn(`[MemoryPlaces] Archive place not found for project ${projectId}`);
    return { archived: 0, failed: 0 };
  }

  // Calculate cutoff dates (Unix timestamp for SQLite)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

  // Additional: 45-day cutoff for low-importance memories
  const lowImpCutoffDate = new Date();
  lowImpCutoffDate.setDate(lowImpCutoffDate.getDate() - 45);
  const lowImpCutoffTimestamp = Math.floor(lowImpCutoffDate.getTime() / 1000);

  // Get all place IDs (excluding archive and inbox)
  const allPlaces = await sqliteDb.select()
    .from(schema.places)
    .where(eq(schema.places.projectId, projectId));
  
  const activePlaceIds = allPlaces
    .filter((p: any) => p.place_type !== 'archive')
    .map((p: any) => p.id);

  const nonInboxNonArchivePlaceIds = allPlaces
    .filter((p: any) => p.place_type !== 'archive' && p.place_type !== 'inbox')
    .map((p: any) => p.id);
  
  if (activePlaceIds.length === 0) {
    return { archived: 0, failed: 0 };
  }

  // Find memories in active places that are older than cutoff
  const oldMemories = await sqliteDb.select({
    memoryId: schema.memories.id,
    placeId: schema.memoryPlaces.placeId,
    createdAt: schema.memories.createdAt,
    importance: schema.memories.importanceScore,
    lastAccessedAt: schema.memories.lastAccessedAt,
  })
  .from(schema.memories)
  .innerJoin(schema.memoryPlaces, eq(schema.memories.id, schema.memoryPlaces.memoryId))
  .where(
    and(
      eq(schema.memories.projectId, projectId),
    )
  );

  // Filter 1: Old memories from active places (original behavior)
  const memoriesToArchive = oldMemories.filter((m: any) => 
    activePlaceIds.includes(m.placeId) && m.createdAt < cutoffTimestamp
  );

  // Filter 2: Low-importance, long-unaccessed memories from non-inbox/non-archive places
  const lowImpMemories = oldMemories.filter((m: any) =>
    nonInboxNonArchivePlaceIds.includes(m.placeId) &&
    (m.createdAt < lowImpCutoffTimestamp || (m.lastAccessedAt && m.lastAccessedAt < lowImpCutoffTimestamp)) &&
    (m.importance ?? 50) < 30
  );

  // Merge, deduplicate by memoryId
  const memoryMap = new Map<string, any>();
  for (const mem of memoriesToArchive) memoryMap.set(mem.memoryId, mem);
  for (const mem of lowImpMemories) {
    if (!memoryMap.has(mem.memoryId)) {
      memoryMap.set(mem.memoryId, mem);
    }
  }

  const allMemoriesToArchive = Array.from(memoryMap.values());

  let archived = 0;
  let failed = 0;
  
  for (const mem of allMemoriesToArchive) {
    try {
      // Move to archive place
      await sqliteDb.update(schema.memoryPlaces)
        .set({ placeId: archivePlace.id })
        .where(eq(schema.memoryPlaces.memoryId, mem.memoryId));
      
      // Update the old place's memory count
      await updatePlaceMemoryCount(mem.placeId);
      
      archived++;
    } catch (e) {
      logger.warn(`[MemoryPlaces] Failed to archive memory ${mem.memoryId}: ${e}`);
      failed++;
    }
  }

  // Update archive place memory count
  if (archived > 0) {
    await updatePlaceMemoryCount(archivePlace.id);
    logger.info(`[MemoryPlaces] Archived ${archived} old memories to Archive place`);
  }
  
  return { archived, failed };
}

/**
 * Assign a memory to multiple places (1:N multi-place routing)
 * 
 * Stores ranked candidates from findMatchingPlaces() into memory_places.
 * Removes previous assignments before inserting new ones.
 * Uses INSERT OR IGNORE to handle unique constraint on (memory_id, place_type, source).
 */
export async function assignMemoryToPlaces(
  memoryId: string,
  candidates: PlaceCandidate[],
  projectId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sqliteDb = db as any;
  const client = sqliteDb.$client || sqliteDb;

  // Remove existing assignments for this memory
  try {
    client.exec(`DELETE FROM memory_places WHERE memory_id = '${memoryId}'`);
  } catch (e) {
    logger.debug(`[MemoryPlaces] Failed to delete existing assignments: ${e}`);
    return;
  }

  // Insert all candidates using raw SQL for reliability
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const id = randomUUID();
    const reason = c.reason ? c.reason.replace(/'/g, "''") : '';
    try {
      client.exec(
        `INSERT OR IGNORE INTO memory_places (id, memory_id, place_type, weight, reason, source, is_primary)
         VALUES ('${id}', '${memoryId}', '${c.type}', ${c.weight}, ${c.reason ? `'${reason}'` : 'NULL'}, '${c.source}', ${i === 0 ? 1 : 0})`
      );
    } catch (e) {
      logger.debug(`[MemoryPlaces] Failed to insert place candidate ${c.type}: ${e}`);
    }
  }

  // Update place memory counts
  for (const c of candidates) {
    const place = await getPlaceByType(projectId, c.type);
    if (place) await updatePlaceMemoryCount(place.id);
  }
}

/**
 * Store normalized tags in memory_tags table
 * 
 * Normalizes tags using tagNormalizer, removes existing tags for the memory,
 * and inserts the new normalized tags.
 */
export async function storeMemoryTags(
  memoryId: string,
  tags: string[],
  source: 'heuristic' | 'llm' | 'manual' | 'dream' = 'heuristic'
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sqliteDb = db as any;
  const client = sqliteDb.$client || sqliteDb;

  if (!tags || tags.length === 0) return;

  // Normalize tags using the tag normalizer
  const { tagNormalizer } = await import('./tag-normalizer.js');
  const normalized = tagNormalizer.normalizeTags(tags);

  // Remove existing tags for this memory
  try {
    client.exec(`DELETE FROM memory_tags WHERE memory_id = '${memoryId}'`);
  } catch {
    // Ignore if table doesn't exist
  }

  // Insert normalized tags using raw SQL
  for (const tag of normalized) {
    const id = randomUUID();
    try {
      client.exec(
        `INSERT OR IGNORE INTO memory_tags (id, memory_id, tag, source)
         VALUES ('${id}', '${memoryId}', '${tag}', '${source}')`
      );
    } catch (e) {
      logger.debug(`[MemoryTags] Failed to insert tag '${tag}': ${e}`);
    }
  }
}