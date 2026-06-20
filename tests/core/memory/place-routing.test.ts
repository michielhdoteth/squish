import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { beforeEach, beforeAll, describe, expect, test } from 'bun:test';

const testDataDir = join(tmpdir(), `squish-place-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

let getDb: typeof import('../../../db/index.js').getDb;
let resetDb: typeof import('../../../db/index.js').resetDb;
let rememberMemory: typeof import('../../../core/memory/memories.js').rememberMemory;
let initializeDefaultPlaces: typeof import('../../../core/places/places.js').initializeDefaultPlaces;
let getPlaceByType: typeof import('../../../core/places/places.js').getPlaceByType;
let getMemoryPlace: typeof import('../../../core/places/memory-places.js').getMemoryPlace;
let getOrCreateProject: typeof import('../../../core/projects.js').getOrCreateProject;

async function clearData() {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec('DELETE FROM memory_places;');
    sqlite.exec('DELETE FROM memories;');
    sqlite.exec('DELETE FROM place_rules;');
    sqlite.exec('DELETE FROM places;');
    sqlite.exec('DELETE FROM projects;');
  }
}

describe('Place routing through rememberMemory', () => {
  beforeAll(async () => {
    const dbMod = await import('../../../db/index.js');
    const memoryMod = await import('../../../core/memory/memories.js');
    const placesMod = await import('../../../core/places/places.js');
    const placeMemoryMod = await import('../../../core/places/memory-places.js');
    const projectsMod = await import('../../../core/projects.js');
    getDb = dbMod.getDb;
    resetDb = dbMod.resetDb;
    rememberMemory = memoryMod.rememberMemory;
    initializeDefaultPlaces = placesMod.initializeDefaultPlaces;
    getPlaceByType = placesMod.getPlaceByType;
    getMemoryPlace = placeMemoryMod.getMemoryPlace;
    getOrCreateProject = projectsMod.getOrCreateProject;
  });

  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
    await clearData();
  });

  test('global memory with explicit placeType routes to global place', async () => {
    const places = await initializeDefaultPlaces();
    const target = places.find((p) => p.placeType === 'ref');
    expect(target).toBeDefined();

    const memory = await rememberMemory({
      content: 'reference memory',
      type: 'fact',
      placeType: 'ref',
    });

    const assignedPlaceId = await getMemoryPlace(memory.id);
    expect(assignedPlaceId).toBe(target!.id);
  });

  test('project memory with explicit placeType routes to project place', async () => {
    const project = await getOrCreateProject('/routing-project');
    expect(project).toBeDefined();
    await initializeDefaultPlaces(project!.id);
    const target = await getPlaceByType(project!.id, 'board');
    expect(target).not.toBeNull();

    const memory = await rememberMemory({
      content: 'decision memory',
      type: 'decision',
      project: '/routing-project',
      placeType: 'board',
    });

    const assignedPlaceId = await getMemoryPlace(memory.id);
    expect(assignedPlaceId).toBe(target!.id);
  });
});
