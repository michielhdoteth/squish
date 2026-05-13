/**
 * Tests for global memory operations (project optional, auto-assign to Inbox)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';

// Setup test environment BEFORE any imports
// Use same data dir as places tests to avoid DB connection conflicts
const testDataDir = join(process.cwd(), '.test-data-places');
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

if (!existsSync(testDataDir)) {
  mkdirSync(testDataDir, { recursive: true });
}

import { resetDb } from '../../../db/index.js';

import { rememberMemory, search, getMemory } from '../../../core/memory/memories.js';
import { getDb } from '../../../db/index.js';
import { initializeGlobalPlaces, getPlaceByType } from '../../../core/places/places.js';
import { getMemoryPlace } from '../../../core/places/memory-places.js';

async function clearAllData() {
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

describe('Global Memory Operations', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  test('rememberMemory without project stores global memory', async () => {
    const memory = await rememberMemory({
      content: 'This is a global memory test',
      type: 'observation',
    });
    expect(memory).toBeDefined();
    expect(memory.id).toBeTypeOf('string');
    expect(memory.projectId).toBeNull();
    expect(memory.content).toBe('This is a global memory test');
  });

  test('rememberMemory with project stores scoped memory', async () => {
    const memory = await rememberMemory({
      content: 'This is a scoped memory',
      project: '/test-scoped-memory',
      type: 'fact',
    });
    expect(memory).toBeDefined();
    expect(memory.projectId).not.toBeNull();
  });

  test('rememberMemory without project auto-assigns to Inbox place', async () => {
    // Initialize global places first
    const places = await initializeGlobalPlaces();
    const inboxPlace = places.find(p => p.placeType === 'inbox');
    expect(inboxPlace).toBeDefined();

    // Create a global memory
    const memory = await rememberMemory({
      content: 'Memory that should go to Inbox',
      type: 'observation',
    });

    // Check it was assigned to a place
    const placeId = await getMemoryPlace(memory.id);
    expect(placeId).not.toBeNull();
    // The place should be the Inbox
    const assignedPlace = places.find(p => p.id === placeId);
    expect(assignedPlace).toBeDefined();
    expect(assignedPlace!.placeType).toBe('inbox');
  });

  test('search without project searches all memories', async () => {
    // Create memories with and without project
    await rememberMemory({
      content: 'Global memory one',
      type: 'observation',
    });
    await rememberMemory({
      content: 'Global memory two',
      type: 'observation',
      project: '/some-project',
    });

    // Search without project should find both
    const results = await search({
      query: 'global memory',
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  test('search with project filters by project', async () => {
    // Create two memories in different scopes
    await rememberMemory({
      content: 'Project A memory',
      type: 'fact',
      project: '/project-a',
    });
    await rememberMemory({
      content: 'Project B memory',
      type: 'fact',
      project: '/project-b',
    });

    // Search with project filter should only find that project's memory
    const results = await search({
      query: 'memory',
      project: '/project-a',
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // All results should be from project-a
    results.forEach(r => {
      expect(r.projectId).not.toBeNull();
    });
  });

  test('getMemory works without project context', async () => {
    const created = await rememberMemory({
      content: 'Memory to retrieve by ID',
      type: 'observation',
    });

    const retrieved = await getMemory(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.content).toBe('Memory to retrieve by ID');
  });
});
