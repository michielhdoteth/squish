import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';

const testDataDir = join(tmpdir(), `squish-policy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';
if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

let resetDb: typeof import('../../../db/index.js').resetDb;
let getDb: typeof import('../../../db/index.js').getDb;
let rememberMemory: typeof import('../../../core/memory/memories.js').rememberMemory;
let promoteMemoryVisibility: typeof import('../../../core/memory/policy.js').promoteMemoryVisibility;
let recommendMemoryScope: typeof import('../../../core/memory/policy.js').recommendMemoryScope;

async function clearData() {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec('DELETE FROM memory_places;');
    sqlite.exec('DELETE FROM memories;');
    sqlite.exec('DELETE FROM places;');
    sqlite.exec('DELETE FROM projects;');
  }
}

describe('memory policy', () => {
  beforeAll(async () => {
    const dbMod = await import('../../../db/index.js');
    const memoryMod = await import('../../../core/memory/memories.js');
    const policyMod = await import('../../../core/memory/policy.js');
    resetDb = dbMod.resetDb;
    getDb = dbMod.getDb;
    rememberMemory = memoryMod.rememberMemory;
    promoteMemoryVisibility = policyMod.promoteMemoryVisibility;
    recommendMemoryScope = policyMod.recommendMemoryScope;
  });

  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    resetDb();
    await clearData();
  });

  test('defaults to private-first capture and personal audience', () => {
    const recommendation = recommendMemoryScope({
      content: 'remember this note about the build',
    });

    expect(recommendation.scope).toBe('private');
    expect(recommendation.source).toBe('heuristic');
  });

  test('recommends a shared scope for durable team knowledge', () => {
    const recommendation = recommendMemoryScope({
      content: 'We decided to standardize on Bun for the team build pipeline',
      type: 'decision',
      visibilityScope: undefined,
    });

    expect(['project', 'team', 'global']).toContain(recommendation.scope);
  });

  test('promotes memory visibility and records history', async () => {
    const created = await rememberMemory({
      content: 'Use the shared onboarding checklist for all new hires',
      type: 'fact',
    });

    const updated = await promoteMemoryVisibility(created.id, 'team', 'shared onboarding knowledge');
    expect(updated).not.toBeNull();
    expect(updated!.visibilityScope).toBe('team');
    expect(updated!.policy.history.length).toBe(1);
    expect(updated!.policy.history[0].from).toBe('private');
    expect(updated!.policy.history[0].to).toBe('team');

    const db = await getDb();
    const sqlite = (db as any).$client;
    const row = sqlite.prepare('SELECT * FROM memories WHERE id = ?').get(created.id) as any;

    expect(row.visibility_scope || row.visibilityScope).toBe('team');
    expect(row.metadata || row.metadata_json).toBeTruthy();
  });
});
