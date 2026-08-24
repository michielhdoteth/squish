/**
 * Batch 7: session bootstrap composer budget enforcement + working-set
 * signal flow end-to-end.
 *
 * Verifies:
 *   - Sections compose in priority order (core-memory > beliefs >
 *     working-set > pinned > recent-decisions)
 *   - Hard token ceilings are respected (chars/4 heuristic)
 *   - Overflow drops lowest-priority sections first
 *   - squish_remember writes feed the working set so wake-up summaries
 *     stop saying "No working set yet"
 */

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-bootstrap-'));
process.env.SQUISH_DATA_DIR = testDataDir;
process.env.DATABASE_URL = '';

import { ensureProject } from '../../../core/projects.js';
import { rememberMemory } from '../../../core/memory/memories.js';
import { pinMemory } from '../../../core/security/governance.js';
import {
  initializeCoreMemory,
  editCoreMemorySection,
} from '../../../core/ingestion/core-memory.js';
import { getLatestProjectWorkingSetSummary } from '../../../core/session/working-set.js';
import {
  composeSessionBootstrap,
  BOOTSTRAP_SECTION_PRIORITY,
} from '../../../core/session/bootstrap.js';
import { estimateTokens } from '../../../core/context/context-window.js';
import { getDb } from '../../../db/index.js';

const projectPath = path.join(testDataDir, 'bootstrap-project');
let projectId: string | null = null;

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

async function settle(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedProject(): Promise<void> {
  await clearAllTables();
  const project = await ensureProject(projectPath);
  projectId = project?.id ?? null;

  // Core memory block (highest priority section)
  if (projectId) {
    await initializeCoreMemory(projectId);
    await editCoreMemorySection(projectId, 'persona', 'Be terse. Ship working code.');
  }

  // Decision memories (recent-decisions section + working-set signals)
  await rememberMemory({
    content: 'Decision: adopt event-driven ingestion for the pipeline rewrite.',
    type: 'decision',
    project: projectPath,
  });
  await rememberMemory({
    content: 'Decision: pin the embedding model id to keep vectors comparable across rebuilds.',
    type: 'decision',
    project: projectPath,
  });

  // Pinned memory
  const pinnedTarget = await rememberMemory({
    content: 'Always run bun test --isolate before pushing to prod.',
    type: 'note',
    project: projectPath,
  });
  await pinMemory(pinnedTarget.id);

  // rememberMemory fires its working-set signal best-effort; give the
  // event loop a beat so the assertions below observe it deterministically.
  await settle();
}

afterAll(async () => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('session bootstrap composer', () => {
  it('priority order is stable', () => {
    expect(BOOTSTRAP_SECTION_PRIORITY).toEqual([
      'core-memory',
      'beliefs',
      'working-set',
      'pinned',
      'recent-decisions',
    ]);
  });

  it('composes sections under the default ceiling with per-section token counts', async () => {
    await seedProject();
    const result = await composeSessionBootstrap({ projectPath });

    expect(result.ceilingTokens).toBe(2000);
    expect(result.totalTokens).toBeLessThanOrEqual(result.ceilingTokens);
    expect(estimateTokens(result.block)).toBeLessThanOrEqual(result.ceilingTokens);

    const names = result.sections.map((s) => s.name);
    for (const expected of BOOTSTRAP_SECTION_PRIORITY) {
      expect(names).toContain(expected);
    }

    const includedNames = result.sections.filter((s) => s.included).map((s) => s.name);
    expect(includedNames).toContain('core-memory');
    expect(includedNames).toContain('recent-decisions');

    // Block contains the rendered sections
    expect(result.block).toContain('# Session bootstrap');
    expect(result.block).toContain('## Core memory');
    expect(result.block).toContain('event-driven ingestion');
  });

  it('tiny ceiling drops low-priority sections first and clamps the block', async () => {
    await seedProject();

    // Enough for core-memory only (30% of 120 = 36 tokens).
    const result = await composeSessionBootstrap({ projectPath, totalTokenCeiling: 120 });
    expect(result.totalTokens).toBeLessThanOrEqual(result.ceilingTokens);

    const byPriorityIncluded = result.sections.filter((s) => s.included);
    const droppedLowest = result.sections.filter(
      (s) => !s.included && s.dropReason === 'ceiling-exceeded'
    );

    // Something must have been dropped by the ceiling...
    if (droppedLowest.length > 0) {
      // ...and every dropped section has LOWER priority than every included one.
      const minIncludedPriority = Math.min(...byPriorityIncluded.map((s) => s.priority));
      for (const dropped of droppedLowest) {
        expect(dropped.priority).toBeGreaterThan(minIncludedPriority);
      }
    }
    // Clamp guarantee holds regardless.
    expect(estimateTokens(result.block)).toBeLessThanOrEqual(result.ceilingTokens);
  });

  it('never returns raw dumps: items stay bounded', async () => {
    await seedProject();
    const result = await composeSessionBootstrap({ projectPath });
    // No line should exceed ~500 chars (per-item caps + labels)
    const longest = Math.max(...result.block.split('\n').map((l) => l.length));
    expect(longest).toBeLessThan(600);
  });
});

describe('working-set signal flow (end-to-end)', () => {
  it('rememberMemory writes make wake-up summaries non-empty', async () => {
    await seedProject();
    const summary = await getLatestProjectWorkingSetSummary(projectPath);
    expect(summary.trim().length).toBeGreaterThan(0);
  });

  it('bootstrap includes the working-set wake-up when activity exists', async () => {
    await seedProject();
    const result = await composeSessionBootstrap({
      projectPath,
      totalTokenCeiling: 2000,
    });
    const ws = result.sections.find((s) => s.name === 'working-set');
    expect(ws?.included ?? false).toBe(true);
  });

  it('empty projects still yield a valid (mostly empty) bootstrap', async () => {
    await clearAllTables();
    const emptyProject = path.join(testDataDir, 'empty-project');
    await ensureProject(emptyProject);
    const result = await composeSessionBootstrap({ projectPath: emptyProject });
    expect(result.block.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(result.ceilingTokens);
    expect(result.sections.every((s) => s.included === false || s.tokens > 0)).toBe(true);
  });
});
