import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';

const testDataDir = join(tmpdir(), `squish-place-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

import { beforeEach, describe, expect, test } from 'bun:test';
import { getDb, resetDb } from '../../../db/index.js';
import { rememberMemory } from '../../../core/memory/memories.js';
import { initializeDefaultPlaces, getPlaceByType } from '../../../core/places/places.js';
import { getMemoryPlace } from '../../../core/places/memory-places.js';
import { getOrCreateProject } from '../../../core/projects.js';

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
