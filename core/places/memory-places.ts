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

/**
 * Assign a memory to a place (auto or manual)
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
  const id = randomUUID();

  // Check if already assigned
  const existing = await sqliteDb.select()
    .from(schema.memoryPlaces)
    .where(eq(schema.memoryPlaces.memoryId, params.memoryId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    await sqliteDb.update(schema.memoryPlaces)
      .set({
        placeId: params.placeId,
        isManual: params.isManual ? 1 : 0,
        ruleId: params.ruleId || null,
      })
      .where(eq(schema.memoryPlaces.memoryId, params.memoryId));
  } else {
    // Insert new
    await sqliteDb.insert(schema.memoryPlaces).values({
      id,
      memoryId: params.memoryId,
      placeId: params.placeId,
      isManual: params.isManual ? 1 : 0,
      ruleId: params.ruleId || null,
    });
  }

  // Update memory's place reference
  await sqliteDb.update(schema.memories)
    .set({ placeId: params.placeId })
    .where(eq(schema.memories.id, params.memoryId));

  // Update place memory count
  await updatePlaceMemoryCount(params.placeId);

  logger.info(`[MemoryPlaces] Assigned memory ${params.memoryId} to place ${params.placeId}`);
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
 */
export async function getMemoryPlace(memoryId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const result = await sqliteDb.select()
    .from(schema.memoryPlaces)
    .where(eq(schema.memoryPlaces.memoryId, memoryId))
    .limit(1);

  return result.length > 0 ? (result[0].place_id ?? result[0].placeId) : null;
}

/**
 * Get memories for a place
 */
export async function getPlaceMemories(placeId: string, limit: number = 50): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const results = await sqliteDb.select({ memoryId: schema.memoryPlaces.memoryId })
    .from(schema.memoryPlaces)
    .where(eq(schema.memoryPlaces.placeId, placeId))
    .limit(limit);

  return results.map((r: any) => r.memoryId);
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
 * Auto-archive old memories - move memories > 30 days from active places to Archive
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

  // Calculate cutoff date (Unix timestamp for SQLite)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
  
  // Get all active place IDs (not archive)
  const allPlaces = await sqliteDb.select()
    .from(schema.places)
    .where(eq(schema.places.projectId, projectId));
  
  const activePlaceIds = allPlaces
    .filter((p: any) => p.place_type !== 'archive')
    .map((p: any) => p.id);
  
  if (activePlaceIds.length === 0) {
    return { archived: 0, failed: 0 };
  }

  // Find memories in active places that are older than cutoff
  // Use raw SQL for complex date comparison
  const oldMemories = await sqliteDb.select({
    memoryId: schema.memories.id,
    placeId: schema.memoryPlaces.placeId,
    createdAt: schema.memories.createdAt,
  })
  .from(schema.memories)
  .innerJoin(schema.memoryPlaces, eq(schema.memories.id, schema.memoryPlaces.memoryId))
  .where(
    and(
      eq(schema.memories.projectId, projectId),
      // Memories in active places (not archive)
    )
  );

  // Actually filter in JS for simplicity
  const memoriesToArchive = oldMemories.filter((m: any) => 
    activePlaceIds.includes(m.placeId) && m.createdAt < cutoffTimestamp
  );

  let archived = 0;
  let failed = 0;
  
  for (const mem of memoriesToArchive) {
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