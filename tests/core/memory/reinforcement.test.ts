/**
 * Batch 6b: reinforcement loop - applyFeedback wiring across
 * memory / belief / strategy targets.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'squish-reinforce-'));
process.env.SQUISH_DATA_DIR = tempDir;
process.env.DATABASE_URL = '';

const { resetDb, getDb } = await import('../../../db/index.js');
const { applyFeedback } = await import('../../../core/memory/reinforcement.js');
const { rememberMemory } = await import('../../../core/memory/memories.js');
const { createKnowledge } = await import('../../../core/knowledge/knowledge-crud.js');
const { getOrCreateProject } = await import('../../../core/projects.js');

// File-level cleanup ONCE (describe-scoped afterAll would tear down the temp
// DB between the two suites below).
afterAll(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  delete process.env.SQUISH_DATA_DIR;
});

describe('applyFeedback (Batch 6b reinforcement loop)', () => {
  let memoryId: string;
  let beliefId: string;
  let strategyId: string;

  beforeAll(async () => {
    resetDb();

    const mem = await rememberMemory({
      content: 'The API gateway routes through nginx on the VPS',
      type: 'fact',
    });
    memoryId = mem.id;

    const belief = await createKnowledge({
      knowledgeKind: 'belief',
      knowledgeType: 'decision',
      content: 'We believe bun outperforms node for this workload',
      confidence: 0.6,
      status: 'active',
    });
    beliefId = belief.id;

    const strategy = await createKnowledge({
      knowledgeKind: 'strategy',
      knowledgeType: 'procedure',
      content: 'Deploy via git pull then docker compose up -d --build',
      confidence: 0.5,
      status: 'active',
    });
    strategyId = strategy.id;
  });

  test('memory confirm bumps priority and usage anchors', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const before = sqlite.prepare('SELECT retrieval_priority, usage_count, last_used_at FROM memories WHERE id = ?').get(memoryId);

    const result = await applyFeedback({ targetType: 'memory', id: memoryId, signal: 'confirm' });
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);

    const after = sqlite.prepare('SELECT retrieval_priority, usage_count, last_used_at FROM memories WHERE id = ?').get(memoryId);
    expect(after.retrieval_priority).toBe(Math.min(100, (before.retrieval_priority ?? 50) + 5));
    expect(after.usage_count).toBe((before.usage_count ?? 0) + 1);
    expect(after.last_used_at).not.toBeNull();
  });

  test('memory used refreshes access recency', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const result = await applyFeedback({ targetType: 'memory', id: memoryId, signal: 'used' });
    expect(result.ok).toBe(true);

    const row = sqlite.prepare('SELECT access_count, last_accessed_at FROM memories WHERE id = ?').get(memoryId);
    expect(row.access_count).toBeGreaterThanOrEqual(1);
    expect(row.last_accessed_at).not.toBeNull();
  });

  test('memory contradict marks outdated - a column recall-confidence reads', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const result = await applyFeedback({ targetType: 'memory', id: memoryId, signal: 'contradict' });
    expect(result.ok).toBe(true);

    const row = sqlite.prepare('SELECT confidence_level FROM memories WHERE id = ?').get(memoryId);
    expect(row.confidence_level).toBe('outdated');
  });

  test('belief confirm boosts confidence and resets decay timer', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const before = sqlite.prepare('SELECT confidence, source_count FROM knowledge WHERE id = ?').get(beliefId);

    const result = await applyFeedback({ targetType: 'belief', id: beliefId, signal: 'confirm' });
    expect(result.ok).toBe(true);
    expect(result.confidence).toBeCloseTo(Math.min(1, before.confidence + 0.08), 5);

    const after = sqlite.prepare('SELECT confidence, source_count, last_confirmed_at FROM knowledge WHERE id = ?').get(beliefId);
    expect(after.source_count).toBe(before.source_count + 1);
    expect(after.last_confirmed_at).not.toBeNull();
  });

  test('belief contradict marks disputed with penalty', async () => {
    const result = await applyFeedback({ targetType: 'belief', id: beliefId, signal: 'contradict' });
    expect(result.ok).toBe(true);

    const db = await getDb();
    const sqlite = (db as any).$client;
    const row = sqlite.prepare('SELECT status FROM knowledge WHERE id = ?').get(beliefId);
    expect(row.status).toBe('disputed');
  });

  test('strategy used records success usage; contradict records failure', async () => {
    const result = await applyFeedback({ targetType: 'strategy', id: strategyId, signal: 'used' });
    expect(result.ok).toBe(true);

    const db = await getDb();
    const sqlite = (db as any).$client;
    let row = sqlite.prepare('SELECT usage_count, success_count, last_used_at FROM knowledge WHERE id = ?').get(strategyId);
    expect(row.usage_count).toBe(1);
    expect(row.success_count).toBe(1);
    expect(row.last_used_at).not.toBeNull();

    const failResult = await applyFeedback({ targetType: 'strategy', id: strategyId, signal: 'contradict' });
    expect(failResult.ok).toBe(true);
    row = sqlite.prepare('SELECT usage_count, failure_count FROM knowledge WHERE id = ?').get(strategyId);
    expect(row.usage_count).toBe(2);
    expect(row.failure_count).toBe(1);
  });

  test('missing id fails gracefully without throwing', async () => {
    const result = await applyFeedback({ targetType: 'belief', id: '', signal: 'confirm' });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('id required');
  });
});

describe('applyFeedback project scoping (Batch 6b fix)', () => {
  let scopedMemoryId: string;
  let scopedBeliefId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    resetDb();

    // Two registered projects.
    await getOrCreateProject('/proj/alpha');
    const other = await getOrCreateProject('/proj/beta');
    otherProjectId = other!.id;
    const mem = await rememberMemory({
      content: 'Alpha-scoped fact: the ingest queue runs on redis',
      type: 'fact',
      project: '/proj/alpha',
    });
    scopedMemoryId = mem.id;

    const belief = await createKnowledge({
      projectId: (await getOrCreateProject('/proj/alpha'))!.id,
      knowledgeKind: 'belief',
      knowledgeType: 'decision',
      content: 'Alpha believes bun is faster for CLI startup',
      confidence: 0.6,
      status: 'active',
    });
    scopedBeliefId = belief.id;
  });

  test('same-project memory feedback succeeds', async () => {
    const result = await applyFeedback({
      targetType: 'memory', id: scopedMemoryId, signal: 'confirm', project: '/proj/alpha',
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
  });

  test('cross-project memory feedback is rejected with a clear error and mutates nothing', async () => {
    const db = await getDb();
    const sqlite = (db as any).$client;
    const before = sqlite.prepare('SELECT usage_count, retrieval_priority FROM memories WHERE id = ?').get(scopedMemoryId);

    const result = await applyFeedback({
      targetType: 'memory', id: scopedMemoryId, signal: 'confirm', project: '/proj/beta',
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('cross-project feedback rejected');

    const after = sqlite.prepare('SELECT usage_count, retrieval_priority FROM memories WHERE id = ?').get(scopedMemoryId);
    expect(after.usage_count).toBe(before.usage_count);
    expect(after.retrieval_priority).toBe(before.retrieval_priority);
  });

  test('unregistered project path is rejected loudly, not silently bypassed', async () => {
    const result = await applyFeedback({
      targetType: 'memory', id: scopedMemoryId, signal: 'used', project: '/proj/does-not-exist',
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('project context not found');
  });

  test('omitting project keeps global scope (back-compat) and still applies', async () => {
    const result = await applyFeedback({ targetType: 'memory', id: scopedMemoryId, signal: 'used' });
    expect(result.ok).toBe(true);
  });

  test('same-project belief feedback succeeds; cross-project belief feedback is rejected', async () => {
    const okResult = await applyFeedback({
      targetType: 'belief', id: scopedBeliefId, signal: 'confirm', project: '/proj/alpha',
    });
    expect(okResult.ok).toBe(true);
    expect(typeof okResult.confidence).toBe('number');

    const badResult = await applyFeedback({
      targetType: 'belief', id: scopedBeliefId, signal: 'contradict', project: '/proj/beta',
    });
    expect(badResult.ok).toBe(false);
    expect(badResult.detail).toContain('cross-project feedback rejected');

    // The belief must remain active - the contradict never landed.
    const sqlite = (await getDb() as any).$client;
    const row = sqlite.prepare('SELECT status FROM knowledge WHERE id = ?').get(scopedBeliefId);
    expect(row.status).not.toBe('disputed');
  });

  test('strategy scoping: same-project applies, cross-project rejects', async () => {
    const strategy = await createKnowledge({
      projectId: otherProjectId,
      knowledgeKind: 'strategy',
      knowledgeType: 'procedure',
      content: 'Beta deploy runbook: pull, build, healthcheck, promote',
      confidence: 0.5,
      status: 'active',
    });

    const wrongScope = await applyFeedback({
      targetType: 'strategy', id: strategy.id, signal: 'used', project: '/proj/alpha',
    });
    expect(wrongScope.ok).toBe(false);
    expect(wrongScope.detail).toContain('cross-project feedback rejected');

    const rightScope = await applyFeedback({
      targetType: 'strategy', id: strategy.id, signal: 'used', project: '/proj/beta',
    });
    expect(rightScope.ok).toBe(true);

    const sqlite = (await getDb() as any).$client;
    const row = sqlite.prepare('SELECT usage_count FROM knowledge WHERE id = ?').get(strategy.id);
    expect(row.usage_count).toBe(1); // only the in-scope call landed
  });
});
