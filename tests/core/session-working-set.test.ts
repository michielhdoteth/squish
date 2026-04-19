import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const testDataDir = join(process.cwd(), '.test-data-session-working-set');
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

if (!existsSync(testDataDir)) {
  mkdirSync(testDataDir, { recursive: true });
}

import { ensureProject } from '../../core/projects.js';
import {
  recordSessionSignal,
  getSessionWorkingSet,
  compactSessionWorkingSet,
} from '../../core/session/working-set.js';
import { getDb } from '../../db/index.js';

async function clearAllTables() {
  const db = await getDb();
  const sqlite = (db as any).$client;
  if (!sqlite || typeof sqlite.prepare !== 'function') return;

  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row: any) => row.name)
    .filter((name: string) => !name.startsWith('sqlite_') && !name.includes('_fts'));

  for (const table of tables) {
    sqlite.exec(`DELETE FROM ${table};`);
  }
}

describe('session working set', () => {
  const projectPath = join(process.cwd(), 'tmp-project-working-set');
  const sessionId = 'session-working-set-1';

  beforeEach(async () => {
    await clearAllTables();
    await ensureProject(projectPath);
  });

  afterEach(async () => {
    await clearAllTables();
  });

  it('records active files, commands, failures, and hypotheses in the session working set', async () => {
    await recordSessionSignal({
      sessionId,
      projectPath,
      classification: 'session-only',
      distilledContent: 'Current hypothesis: search ranking regression is caused by stale recency weighting.',
      toolName: 'Task',
      target: 'search ranking',
      metadata: {
        activeFiles: ['core/memory/memories.ts'],
        activePlaces: ['wip'],
        graphEntities: ['SearchResult'],
        command: 'bun test tests/core/hybrid-scorer.test.ts',
        outcome: 'failure',
      },
    });

    const workingSet = await getSessionWorkingSet(sessionId, projectPath);

    expect(workingSet.activeFiles).toContain('core/memory/memories.ts');
    expect(workingSet.recentCommands[0]?.command).toContain('bun test');
    expect(workingSet.currentHypotheses[0]).toContain('stale recency');
    expect(workingSet.recentFailures[0]).toContain('search ranking');
    expect(workingSet.activePlaces).toContain('wip');
    expect(workingSet.graphEntities).toContain('SearchResult');
  });

  it('compacts duplicated session entries into a concise wake-up summary', async () => {
    await recordSessionSignal({
      sessionId,
      projectPath,
      classification: 'session-only',
      distilledContent: 'Current hypothesis: ranking issue is caused by stale recency weighting.',
      toolName: 'Task',
      target: 'ranking',
      metadata: { activeFiles: ['core/memory/memories.ts'] },
    });

    await recordSessionSignal({
      sessionId,
      projectPath,
      classification: 'session-only',
      distilledContent: 'Current hypothesis: ranking issue is caused by stale recency weighting.',
      toolName: 'Task',
      target: 'ranking',
      metadata: { activeFiles: ['core/memory/memories.ts'] },
    });

    const compacted = await compactSessionWorkingSet(sessionId, projectPath);

    expect(compacted.summary).toContain('ranking issue');
    expect(compacted.summary.match(/stale recency weighting/g)?.length).toBe(1);
  });

  it('tracks place-routing and graph-enrichment counts in signal stats', async () => {
    await recordSessionSignal({
      sessionId,
      projectPath,
      classification: 'durable-distilled',
      distilledContent: 'Edited search ranking flow.',
      toolName: 'Edit',
      target: 'core/memory/memories.ts',
      metadata: {
        activePlaces: ['wip'],
        graphEntities: ['SearchResult', 'graph boost'],
        placeRouted: true,
        graphEnriched: true,
      },
    });

    const workingSet = await getSessionWorkingSet(sessionId, projectPath);
    expect(workingSet.signalStats.placeRouted).toBe(1);
    expect(workingSet.signalStats.graphEnriched).toBe(1);
  });
});
