/**
 * Places Module - Spatial memory organization (Method of Loci)
 * 
 * Provides spatial "places" for memory organization:
 * - Entry Hall: Project overview, goals
 * - Library: Research, patterns, discoveries
 * - Workshop: Implementation, code, fixes
 * - Lab: Experiments, tests, trials
 * - Office: Decisions, planning, roadmap
 * - Garden: Ideas, future concepts
 * - Archive: Completed, historical
 */

import { randomUUID } from 'crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';

// Place types matching the 7 default places
export type PlaceType = 
  | 'entry_hall' 
  | 'library' 
  | 'workshop' 
  | 'lab' 
  | 'office' 
  | 'garden' 
  | 'archive';

export interface Place {
  id: string;
  projectId: string;
  name: string;
  placeType: PlaceType;
  parentId: string | null;
  lociIndex: number;
  positionX: number;
  positionY: number;
  description: string | null;
  purpose: string | null;
  memoryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceCreateInput {
  projectId: string;
  name: string;
  placeType: PlaceType;
  parentId?: string | null;
  lociIndex?: number;
  description?: string;
  purpose?: string;
}

export interface PlaceUpdateInput {
  name?: string;
  description?: string;
  purpose?: string;
  lociIndex?: number;
  positionX?: number;
  positionY?: number;
}

// Default places configuration
export const DEFAULT_PLACES: Omit<PlaceCreateInput, 'projectId'>[] = [
  { name: 'Entry Hall', placeType: 'entry_hall', lociIndex: 0, description: 'Project overview, goals, and current status', purpose: 'Quick orientation to project state' },
  { name: 'Library', placeType: 'library', lociIndex: 1, description: 'Research, patterns, and discoveries', purpose: 'Reference knowledge and learned patterns' },
  { name: 'Workshop', placeType: 'workshop', lociIndex: 2, description: 'Implementation, code, and fixes', purpose: 'Active development and recent changes' },
  { name: 'Lab', placeType: 'lab', lociIndex: 3, description: 'Experiments, tests, and trials', purpose: 'Testing and exploration results' },
  { name: 'Office', placeType: 'office', lociIndex: 4, description: 'Decisions, planning, and roadmap', purpose: 'Project direction and decisions' },
  { name: 'Garden', placeType: 'garden', lociIndex: 5, description: 'Ideas and future concepts', purpose: 'Brainstorming and upcoming plans' },
  { name: 'Archive', placeType: 'archive', lociIndex: 6, description: 'Completed and historical items', purpose: 'Reference for completed work' },
];

/**
 * Create a new place
 */
export async function createPlace(input: PlaceCreateInput): Promise<Place> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database unavailable');
  }

  const schema = await getSchema();
  const sqliteDb = db as any;
  const id = randomUUID();

  // Check for duplicate
  const existing = await sqliteDb.select()
    .from(schema.places)
    .where(and(
      eq(schema.places.projectId, input.projectId),
      eq(schema.places.name, input.name),
      input.parentId
        ? eq(schema.places.parentId, input.parentId)
        : isNull(schema.places.parentId)
    ))
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`Place "${input.name}" already exists`);
  }

  await sqliteDb.insert(schema.places).values({
    id,
    projectId: input.projectId,
    name: input.name,
    placeType: input.placeType,
    parentId: input.parentId || null,
    lociIndex: input.lociIndex ?? 0,
    positionX: 0,
    positionY: 0,
    description: input.description || null,
    purpose: input.purpose || null,
    memoryCount: 0,
  });

  logger.info(`[Places] Created place: ${input.name} (${input.placeType})`);

  return {
    id,
    projectId: input.projectId,
    name: input.name,
    placeType: input.placeType,
    parentId: input.parentId || null,
    lociIndex: input.lociIndex ?? 0,
    positionX: 0,
    positionY: 0,
    description: input.description || null,
    purpose: input.purpose || null,
    memoryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get a place by ID
 */
export async function getPlace(id: string): Promise<Place | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const result = await sqliteDb.select()
    .from(schema.places)
    .where(eq(schema.places.id, id))
    .limit(1);

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: (row.place_type || row.placeType || 'custom') as PlaceType,
    parentId: row.parent_id || row.parentId || null,
    lociIndex: row.loci_index ?? row.lociIndex ?? 0,
    positionX: row.position_x ?? row.positionX ?? 0,
    positionY: row.position_y ?? row.positionY ?? 0,
    description: row.description,
    purpose: row.purpose,
    memoryCount: row.memory_count ?? row.memoryCount ?? 0,
    createdAt: new Date(row.created_at || row.createdAt || Date.now()),
    updatedAt: new Date(row.updated_at || row.updatedAt || Date.now()),
  };
}

/**
 * Get places for a project, ordered by loci_index
 */
export async function getProjectPlaces(projectId: string): Promise<Place[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const results = await sqliteDb.select()
    .from(schema.places)
    .where(eq(schema.places.projectId, projectId))
    .orderBy(schema.places.lociIndex);

  return results.map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: (row.place_type || row.placeType) as PlaceType,
    parentId: row.parent_id || row.parentId,
    lociIndex: row.loci_index ?? row.lociIndex ?? 0,
    positionX: row.position_x ?? row.positionX ?? 0,
    positionY: row.position_y ?? row.positionY ?? 0,
    description: row.description,
    purpose: row.purpose,
    memoryCount: row.memory_count ?? row.memoryCount ?? 0,
    createdAt: new Date(row.created_at || row.createdAt),
    updatedAt: new Date(row.updated_at || row.updatedAt),
  }));
}

/**
 * Get place by type for a project
 */
export async function getPlaceByType(projectId: string, placeType: PlaceType): Promise<Place | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const result = await sqliteDb.select()
    .from(schema.places)
    .where(and(
      eq(schema.places.projectId, projectId),
      eq(schema.places.placeType, placeType)
    ))
    .limit(1);

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: (row.place_type || row.placeType || 'custom') as PlaceType,
    parentId: row.parent_id || row.parentId || null,
    lociIndex: row.loci_index ?? row.lociIndex ?? 0,
    positionX: row.position_x ?? row.positionX ?? 0,
    positionY: row.position_y ?? row.positionY ?? 0,
    description: row.description,
    purpose: row.purpose,
    memoryCount: row.memory_count ?? row.memoryCount ?? 0,
    createdAt: new Date(row.created_at || row.createdAt || Date.now()),
    updatedAt: new Date(row.updated_at || row.updatedAt || Date.now()),
  };
}

/**
 * Update a place
 */
export async function updatePlace(id: string, input: PlaceUpdateInput): Promise<Place | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const updateData: any = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.purpose !== undefined) updateData.purpose = input.purpose;
  if (input.lociIndex !== undefined) updateData.lociIndex = input.lociIndex;
  if (input.positionX !== undefined) updateData.positionX = input.positionX;
  if (input.positionY !== undefined) updateData.positionY = input.positionY;

  if (Object.keys(updateData).length === 0) {
    return getPlace(id);
  }

  await sqliteDb.update(schema.places)
    .set(updateData)
    .where(eq(schema.places.id, id));

  return getPlace(id);
}

/**
 * Delete a place
 */
export async function deletePlace(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const schema = await getSchema();
  const sqliteDb = db as any;

  await sqliteDb.delete(schema.places).where(eq(schema.places.id, id));
  logger.info(`[Places] Deleted place: ${id}`);

  return true;
}

/**
 * Initialize default 7 places for a project
 */
export async function initializeDefaultPlaces(projectId: string): Promise<Place[]> {
  const created: Place[] = [];

  for (const placeConfig of DEFAULT_PLACES) {
    // Check if place of this type already exists
    const existing = await getPlaceByType(projectId, placeConfig.placeType);
    
    if (existing) {
      created.push(existing);
      continue;
    }

    const place = await createPlace({
      projectId,
      name: placeConfig.name,
      placeType: placeConfig.placeType,
      parentId: null,
      lociIndex: placeConfig.lociIndex,
      description: placeConfig.description,
      purpose: placeConfig.purpose,
    });

    created.push(place);
  }

  // Also initialize default rules if none exist
  const { initializeDefaultRules } = await import('./rules.js');
  await initializeDefaultRules(projectId);

  logger.info(`[Places] Initialized ${created.length} default places for project: ${projectId}`);
  return created;
}

/**
 * Get place by loci index
 */
export async function getPlaceByLociIndex(projectId: string, lociIndex: number): Promise<Place | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const result = await sqliteDb.select()
    .from(schema.places)
    .where(and(
      eq(schema.places.projectId, projectId),
      eq(schema.places.lociIndex, lociIndex)
    ))
    .limit(1);

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    placeType: (row.place_type || row.placeType || 'custom') as PlaceType,
    parentId: row.parent_id || row.parentId || null,
    lociIndex: row.loci_index ?? row.lociIndex ?? 0,
    positionX: row.position_x ?? row.positionX ?? 0,
    positionY: row.position_y ?? row.positionY ?? 0,
    description: row.description,
    purpose: row.purpose,
    memoryCount: row.memory_count ?? row.memoryCount ?? 0,
    createdAt: new Date(row.created_at || row.createdAt || Date.now()),
    updatedAt: new Date(row.updated_at || row.updatedAt || Date.now()),
  };
}

/**
 * Update memory count for a place
 */
export async function updatePlaceMemoryCount(placeId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Count memories in this place
  const countResult = await sqliteDb.select({ count: schema.memoryPlaces.id })
    .from(schema.memoryPlaces)
    .where(eq(schema.memoryPlaces.placeId, placeId));

  const count = countResult.length;

  await sqliteDb.update(schema.places)
    .set({ memoryCount: count })
    .where(eq(schema.places.id, placeId));
}

/**
 * Sync all place memory counts - recalculate counts for all places in a project
 * Useful for fixing counts after bulk operations or data recovery
 */
export async function syncAllPlaceMemoryCounts(projectId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get all places for this project
  const allPlaces = await sqliteDb.select()
    .from(schema.places)
    .where(eq(schema.places.projectId, projectId));

  // Update each place's memory count
  for (const place of allPlaces) {
    await updatePlaceMemoryCount(place.id);
  }
  
  logger.info(`[Places] Synced memory counts for ${allPlaces.length} places`);
}