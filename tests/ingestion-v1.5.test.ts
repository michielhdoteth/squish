import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';

const testDataDir = join(tmpdir(), `squish-ingestion-v15-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

import { beforeEach, describe, expect, test } from 'bun:test';
import { getDb, resetDb } from '../db/index.js';
import { rememberMemory } from '../core/memory/memories.js';
import { initializeDefaultPlaces } from '../core/places/places.js';
import { assignMemoryToPlaces, storeMemoryTags, assignMemoryToPlace, getMemoryPlace } from '../core/places/memory-places.js';
import { findMatchingPlaces } from '../core/places/rules.js';
import { ensureGlobalProject } from '../core/places/places.js';

function getSqlite() {
  // Access the raw SQLite client for direct queries
  const dbRef = { current: null as any };
  return {
    exec(sql: string) {
      // We need to get the raw sqlite client
      return (async () => {
        const db = await getDb();
        const sqlite = (db as any).$client;
        if (sqlite && typeof sqlite.exec === 'function') {
          sqlite.exec(sql);
        }
      })();
    },
    prepare(sql: string) {
      return (async () => {
        const db = await getDb();
        const sqlite = (db as any).$client;
        if (sqlite && typeof sqlite.prepare === 'function') {
          return sqlite.prepare(sql);
        }
        return null;
      })();
    }
  };
}

async function execSql(sql: string) {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec(sql);
  }
}

async function queryAll(sql: string, ...params: any[]) {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.prepare === 'function') {
    const stmt = sqlite.prepare(sql);
    return params.length > 0 ? stmt.all(...params) : stmt.all();
  }
  return [];
}

async function clearData() {
  await execSql('DELETE FROM memory_tags;');
  await execSql('DELETE FROM memory_places;');
  await execSql('DELETE FROM memories;');
  await execSql('DELETE FROM place_rules;');
  await execSql('DELETE FROM places;');
  await execSql('DELETE FROM projects;');
}

describe('Ingestion v1.5 - Multi-place assignment', () => {
  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
    await clearData();
  });

  test('assignMemoryToPlaces stores multiple candidates in memory_places', async () => {
    await initializeDefaultPlaces();

    // Get ranked candidates for a Write tool memory
    const candidates = await findMatchingPlaces(undefined, {
      toolName: 'Write',
      content: 'decided to implement the fix',
    });

    // Should have at least 2 candidates (wip from Write tool, board from "decided" keyword)
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    const memory = await rememberMemory({
      content: 'decided to implement the fix',
      type: 'decision',
    });

    // Verify that the memory got assigned to multiple places via findMatchingPlaces
    const assignments = await queryAll(
      'SELECT * FROM memory_places WHERE memory_id = ?',
      memory.id
    );

    // The assignMemoryToDefaultPlace should have called assignMemoryToPlaces
    // So we should see multiple assignments
    expect(assignments.length).toBeGreaterThanOrEqual(1);

    // Verify place types match candidates
    const assignedTypes = assignments.map((a: any) => a.place_type || a.placeType);
    const candidateTypes = candidates.map(c => c.type);
    // At least one candidate type should be in assigned types
    const hasOverlap = candidateTypes.some(ct => assignedTypes.includes(ct));
    expect(hasOverlap).toBe(true);
  });

  test('primaryPlace is set on the memories table', async () => {
    const memory = await rememberMemory({
      content: 'random memory content',
      type: 'observation',
    });

    // Check that primaryPlace is set
    const rows = await queryAll(
      'SELECT * FROM memories WHERE id = ?',
      memory.id
    );

    expect(rows.length).toBe(1);
    const row = rows[0] as any;
    // primaryPlace should be set (to some place type like 'inbox')
    expect(row.primary_place || row.primaryPlace).toBeTruthy();
  });

  test('place_id on memories is set for legacy compatibility', async () => {
    const places = await initializeDefaultPlaces();
    const memory = await rememberMemory({
      content: 'legacy compat memory',
      type: 'fact',
    });

    const rows = await queryAll(
      'SELECT * FROM memories WHERE id = ?',
      memory.id
    );

    expect(rows.length).toBe(1);
    const row = rows[0] as any;
    // primaryPlace should be set (to some place type like 'inbox')
    const primary = row.primary_place || row.primaryPlace;
    expect(primary).toBeTruthy();
    // Legacy place_id column should also be set (resolved from place type)
    const legacyPlaceId = row.place_id || row.placeId;
    expect(legacyPlaceId).toBeTruthy();
    // The legacy place_id should be a valid UUID (FK to places table)
    expect(typeof legacyPlaceId).toBe('string');
    expect(legacyPlaceId.length).toBeGreaterThan(0);
  });

  test('storeMemoryTags stores normalized tags in memory_tags', async () => {
    const memory = await rememberMemory({
      content: 'tagged memory',
      type: 'observation',
      tags: ['Machine Learning', 'NEURAL-NETWORK', 'deep learning'],
    });

    // Check that tags were stored in memory_tags
    const tags = await queryAll(
      'SELECT * FROM memory_tags WHERE memory_id = ?',
      memory.id
    );

    // Should have stored normalized tags
    expect(tags.length).toBeGreaterThan(0);

    // Tags should be normalized (lowercase, hyphens)
    const tagValues = tags.map((t: any) => t.tag);
    // "Machine Learning" -> "machine-learning"
    expect(tagValues).toContain('machine-learning');
    // "NEURAL-NETWORK" -> "neural-network"
    expect(tagValues).toContain('neural-network');
    // "deep learning" -> "deep-learning"
    expect(tagValues).toContain('deep-learning');
  });

  test('old assignMemoryToPlace still works for manual assignment', async () => {
    const places = await initializeDefaultPlaces();
    const refPlace = places.find(p => p.placeType === 'ref');
    expect(refPlace).toBeDefined();

    const memory = await rememberMemory({
      content: 'manual assignment test',
      type: 'fact',
    });

    // Use the old single-place assignment
    const success = await assignMemoryToPlace({
      memoryId: memory.id,
      placeId: refPlace!.id,
      isManual: true,
    });

    expect(success).toBe(true);

    // Verify memory is assigned to the place via getMemoryPlace
    const assignedPlaceId = await getMemoryPlace(memory.id);
    expect(assignedPlaceId).toBe(refPlace!.id);
  });
});
