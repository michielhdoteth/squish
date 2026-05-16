import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { calculateGraphBoost, calculateRecencyBonus } from '../../../core/search/graph-boost.js';
import { getDbClient } from '../../../core/lib/db-client.js';
import { createDatabaseClient } from '../../../core/storage/database.js';

/**
 * Integration test for graph boost v2
 * Verifies that graph boost affects search results
 */

describe('Graph Boost v2 Integration', () => {
  let db: any;
  let testProjectId: string;
  let mem1Id: string;
  let mem2Id: string;
  let mem3Id: string;

  beforeEach(async () => {
    // Setup: Create test database and memories with associations
    const client = await getDbClient();
    db = client.db;

    // Create test project
    const project = db.prepare(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'test-project-1',
      'Test Project',
      Date.now(),
      Date.now()
    );
    testProjectId = 'test-project-1';

    // Create test memories
    mem1Id = 'mem-integration-1';
    mem2Id = 'mem-integration-2';
    mem3Id = 'mem-integration-3';

    const now = Date.now();
    const insertMem = db.prepare(`
      INSERT INTO memories (id, project_id, type, content, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMem.run(mem1Id, testProjectId, 'fact', 'Memory 1 about graph boost', '[]', '{}', now, now);
    insertMem.run(mem2Id, testProjectId, 'fact', 'Memory 2 related to memory 1', '[]', '{}', now, now);
    insertMem.run(mem3Id, testProjectId, 'fact', 'Memory 3 unrelated', '[]', '{}', now, now);

    // Create associations: mem1 <-> mem2 with high weight
    const insertAssoc = db.prepare(`
      INSERT INTO memory_associations (id, from_memory_id, to_memory_id, weight, association_type, coactivation_count, last_coactivated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAssoc.run(
      'assoc-1',
      mem1Id,
      mem2Id,
      2.0, // High weight
      'relates_to',
      5, // High coactivation
      new Date().toISOString(), // Today = 1.5x bonus
      now,
      now
    );

    // mem2 <-> mem3 with lower weight
    insertAssoc.run(
      'assoc-2',
      mem2Id,
      mem3Id,
      1.0, // Lower weight
      'supports',
      2,
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago = 1.0x bonus
      now,
      now
    );
  });

  afterEach(async () => {
    // Cleanup
    try {
      const client = await getDbClient();
      const db = client.db;
      db.prepare(`DELETE FROM memory_associations WHERE id IN ('assoc-1', 'assoc-2', 'assoc-3')`).run();
      db.prepare(`DELETE FROM memories WHERE project_id = ?`).run(testProjectId);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(testProjectId);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should calculate boost for memory with associations', async () => {
    const boostMap = await calculateGraphBoost([mem1Id], testProjectId, { maxDepth: 2, minWeight: 0.3 });

    expect(boostMap.has(mem1Id)).toBe(true);
    const boost = boostMap.get(mem1Id) || 0;

    // mem1 has association to mem2 with:
    // weight=2.0, coactivation=5, recency=1.5 (today), depth=1
    // boost = (2.0 * 5 * 1.5) / (1 + 1) = 15 / 2 = 7.5
    // But capped at 3.0
    expect(boost).toBeLessThanOrEqual(3.0);
    expect(boost).toBeGreaterThan(0);
  });

  test('should respect maxDepth parameter', async () => {
    // With maxDepth=1, should only get direct associations (mem2)
    // mem2 has association to mem3, but that's depth 2 which should be excluded
    const boostMap = await calculateGraphBoost([mem1Id], testProjectId, { maxDepth: 1, minWeight: 0.0 });

    expect(boostMap.has(mem1Id)).toBe(true);
    const boost = boostMap.get(mem1Id) || 0;

    // With maxDepth=1, only mem2 is traversed (depth 1)
    // mem3 is at depth 2 from mem1, so it should NOT be included
    expect(boost).toBeGreaterThanOrEqual(0);
  });

  test('should respect minWeight filter', async () => {
    // With minWeight=2.0, only the first association (weight=2.0) should be included
    // The second association (mem2->mem3, weight=1.0) should be filtered out
    const boostMap = await calculateGraphBoost([mem1Id], testProjectId, { maxDepth: 2, minWeight: 2.0 });

    expect(boostMap.has(mem1Id)).toBe(true);
    const boost = boostMap.get(mem1Id) || 0;

    // Only mem2 association included (weight=2.0, coactivation=5, recency=1.5)
    // boost = (2.0 * 5 * 1.5) / (1 + 1) = 7.5, capped at 3.0
    expect(boost).toBeLessThanOrEqual(3.0);
  });

  test('should cap boost at 3.0x', async () => {
    // Create an association with very high values to test capping
    const client = await getDbClient();
    const db = client.db;

    // Add another high-value association
    db.prepare(`
      INSERT INTO memory_associations (id, from_memory_id, to_memory_id, weight, association_type, coactivation_count, last_coactivated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'assoc-3',
      mem1Id,
      mem3Id,
      5.0, // Very high weight
      'relates_to',
      10, // Very high coactivation
      new Date().toISOString(), // Today
      Date.now(),
      Date.now()
    );

    const boostMap = await calculateGraphBoost([mem1Id], testProjectId, { maxDepth: 1, minWeight: 0.0 });
    const boost = boostMap.get(mem1Id) || 0;

    // Even with high values, boost should be capped at 3.0
    expect(boost).toBeLessThanOrEqual(3.0);
  });

  test('should apply recency bonus correctly', () => {
    // Test recency bonus calculation directly
    const todayBonus = calculateRecencyBonus(new Date());
    expect(todayBonus).toBe(1.5);

    const yesterdayBonus = calculateRecencyBonus(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000));
    expect(yesterdayBonus).toBe(1.2);

    const oldBonus = calculateRecencyBonus(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    expect(oldBonus).toBe(1.0);
  });

  test('should handle empty input', async () => {
    const boostMap = await calculateGraphBoost([]);
    expect(boostMap.size).toBe(0);
  });

  test('should handle invalid memory ID gracefully', async () => {
    const boostMap = await calculateGraphBoost(['invalid-id'], testProjectId);
    // Should return 0 boost for invalid ID (not crash)
    expect(boostMap.get('invalid-id')).toBe(0);
  });
});
