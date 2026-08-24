/**
 * Batch 6b belief governance tests:
 *  1. ACL read gate covers the belief corpus under asset type 'knowledge'.
 *  2. The belief leg is excluded when explicit type/tags filters are set.
 *  3. Candidate ordering is confidence-weighted-recency, so low-confidence
 *     beliefs stay reachable inside the 200-row candidate window.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'squish-belief-governance-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';
process.env.SQUISH_EMBEDDINGS_PROVIDER ||= 'local';

import { resetDb, getDb } from '../../../db/index.js';
const loadoutMod = await import('../../../core/loadout/loadout.js');
const gateMod = await import('../../../core/acl/read-gate.js');
const beliefMod = await import('../../../core/memory/belief-search.js');
const knowledgeMod = await import('../../../core/knowledge/knowledge-crud.js');
const { getOrCreateProject } = await import('../../../core/projects.js');

describe('belief governance (Batch 6b)', () => {
  let savedEnforce: string | undefined;

  beforeAll(async () => {
    resetDb();
    savedEnforce = process.env.SQUISH_ACL_ENFORCE;
  });

  afterAll(async () => {
    if (savedEnforce === undefined) delete process.env.SQUISH_ACL_ENFORCE;
    else process.env.SQUISH_ACL_ENFORCE = savedEnforce;
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    delete process.env.SQUISH_DATA_DIR;
  });

  test('ACL read gate treats knowledge rows as resource type "knowledge"', async () => {
    const project = await getOrCreateProject('/proj/governance');
    const belief = await knowledgeMod.createKnowledge({
      projectId: project!.id,
      knowledgeKind: 'belief',
      knowledgeType: 'decision',
      content: 'Governance fixture: we believe SQLite is enough for local evals',
      confidence: 0.8,
      status: 'active',
    });

    // Rule authored against the knowledge row id with assetType='knowledge':
    // only the owner may read it.
    await loadoutMod.setVisibilityRule({
      assetType: 'knowledge',
      assetId: belief.id,
      ruleType: 'allow',
      granteeType: 'user',
      granteeId: 'user-owner',
      permission: 'read',
    });

    const gated = [{ id: belief.id, corpus: 'belief' }, { id: 'some-memory', corpus: 'memory' }];
    const resolveAssetType = (r: { corpus?: string }) => (r.corpus === 'belief' ? 'knowledge' : 'memory');

    // Log-only default: served but logged as would-filter for strangers.
    delete process.env.SQUISH_ACL_ENFORCE;
    const loggedOut = await gateMod.applyAclReadGate(gated, { userId: 'user-stranger' }, resolveAssetType);
    expect(loggedOut).toHaveLength(2);

    // Enforce mode: stranger loses the belief; owner keeps it.
    process.env.SQUISH_ACL_ENFORCE = 'true';
    try {
      const strangerOut = await gateMod.applyAclReadGate(gated, { userId: 'user-stranger' }, resolveAssetType);
      expect(strangerOut.map(r => r.id)).not.toContain(belief.id);

      const ownerOut = await gateMod.applyAclReadGate(gated, { userId: 'user-owner' }, resolveAssetType);
      expect(ownerOut.map(r => r.id)).toContain(belief.id);
    } finally {
      delete process.env.SQUISH_ACL_ENFORCE;
      await loadoutMod.removeVisibilityRule('knowledge', belief.id, 'user', 'user-owner');
    }
  });

  test('buildAutoAclContext activates when only knowledge rules exist', async () => {
    const project = await getOrCreateProject('/proj/governance');
    const belief = await knowledgeMod.createKnowledge({
      projectId: project!.id,
      knowledgeKind: 'strategy',
      knowledgeType: 'procedure',
      content: 'Auto-context fixture strategy row',
      confidence: 0.7,
      status: 'active',
    });
    await loadoutMod.setVisibilityRule({
      assetType: 'knowledge',
      assetId: belief.id,
      ruleType: 'allow',
      granteeType: 'everyone',
      granteeId: '*',
      permission: 'read',
    });
    try {
      const ctx = await gateMod.buildAutoAclContext(undefined);
      expect(ctx).not.toBeNull();
      expect(ctx!.userId).toBe('local-agent');
    } finally {
      await loadoutMod.removeVisibilityRule('knowledge', belief.id, 'everyone', '*');
    }
    // With no rules of either type left, the auto context stays null.
    const noneCtx = await gateMod.buildAutoAclContext(undefined);
    expect(noneCtx).toBeNull();
  });

  test('belief leg is excluded when type or tags filters are set', async () => {
    const input = { query: 'anything at all', limit: 5 };
    const plain = await beliefMod.beliefSearch(input as any, 5);
    expect(Array.isArray(plain)).toBe(true);

    const byType = await beliefMod.beliefSearch({ ...input, type: 'fact' } as any, 5);
    expect(byType).toEqual([]);

    const byTags = await beliefMod.beliefSearch({ ...input, tags: ['database'] } as any, 5);
    expect(byTags).toEqual([]);
  });

  test('candidate ordering keeps fresh low-confidence beliefs reachable (confidence-weighted-recency)', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
    const sqlite = (db as any).$client;

    // Seed 210 old high-confidence rows + 5 fresh low-confidence rows.
    const insert = sqlite.prepare(
      `INSERT INTO knowledge (id, knowledge_kind, knowledge_type, content, confidence, status, is_active, sector, tier, created_at, updated_at)
       VALUES (?, 'belief', 'preference', ?, ?, 'active', 1, 'semantic', 'working', strftime('%s','now') - ?, strftime('%s','now'))`
    );
    sqlite.exec('BEGIN');
    try {
      for (let i = 0; i < 210; i++) {
        insert.run(`old-hi-${i}`, `Old high confidence preference number ${i}`, 0.99, 300 * 86_400); // ~300d old
      }
      for (let i = 0; i < 5; i++) {
        insert.run(`new-lo-${i}`, `Fresh low confidence preference number ${i}`, 0.10, 60); // seconds old
      }
      sqlite.exec('COMMIT');
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }

    const window = sqlite.prepare(
      `SELECT id FROM knowledge
       WHERE knowledge_kind IN ('belief','strategy') AND status = 'active' AND is_active = 1
       ORDER BY ${beliefMod.BELIEF_CANDIDATE_ORDER_SQL}
       LIMIT 200`
    ).all() as Array<{ id: string }>;
    const ids = new Set(window.map(r => r.id));

    // Under pure confidence DESC the fresh lows would be buried past 200;
    // recency weighting must surface all five inside the candidate window.
    for (let i = 0; i < 5; i++) {
      expect(ids.has(`new-lo-${i}`)).toBe(true);
    }
    // And the window is still mostly the high-confidence corpus.
    let oldCount = 0;
    for (const id of ids) if (id.startsWith('old-hi-')) oldCount += 1;
    expect(oldCount).toBeGreaterThanOrEqual(190);

    // Cleanup so other suites sharing this pattern stay lean.
    sqlite.prepare("DELETE FROM knowledge WHERE id LIKE 'old-hi-%' OR id LIKE 'new-lo-%'").run();
  });
});
