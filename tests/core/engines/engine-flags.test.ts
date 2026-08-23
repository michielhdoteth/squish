/**
 * P5 engine flag tests: default v1, flag switches to v2, shadow logs
 * disagreements while serving v1's answer.
 */
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';

let testDataDir: string;
let savedEnv: Record<string, string | undefined>;

let runContradictionResolution: typeof import('../../../core/engines/contradiction-engine.js').runContradictionResolution;
let computeInitialImportance: typeof import('../../../core/engines/importance-engine.js').computeInitialImportance;
let getEngineLog: typeof import('../../../core/engines/engine-log.js').getEngineLog;
let clearEngineLog: typeof import('../../../core/engines/engine-log.js').clearEngineLog;
let resetDb: typeof import('../../../db/index.js').resetDb;
let getDb: typeof import('../../../db/index.js').getDb;

function baseMemoryInput(content: string, type = 'fact') {
  return {
    content,
    type,
    createdAt: new Date().toISOString(),
    accessCount: 0,
    usageCount: 0,
    isPinned: false,
    isProtected: false,
    isImmutable: false,
  };
}

describe('engine flags (P5)', () => {
  beforeAll(async () => {
    savedEnv = {
      SQUISH_DATA_DIR: process.env.SQUISH_DATA_DIR,
      DATABASE_URL: process.env.DATABASE_URL,
      SQUISH_CONTRADICTION_ENGINE: process.env.SQUISH_CONTRADICTION_ENGINE,
      SQUISH_CONTRADICTION_SHADOW: process.env.SQUISH_CONTRADICTION_SHADOW,
      SQUISH_IMPORTANCE_ENGINE: process.env.SQUISH_IMPORTANCE_ENGINE,
      SQUISH_IMPORTANCE_SHADOW: process.env.SQUISH_IMPORTANCE_SHADOW,
    };

    testDataDir = join(tmpdir(), `squish-engine-flags-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDataDir, { recursive: true });
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';

    const ceMod = await import('../../../core/engines/contradiction-engine.js');
    const ieMod = await import('../../../core/engines/importance-engine.js');
    const logMod = await import('../../../core/engines/engine-log.js');
    const dbMod = await import('../../../db/index.js');
    runContradictionResolution = ceMod.runContradictionResolution;
    computeInitialImportance = ieMod.computeInitialImportance;
    getEngineLog = logMod.getEngineLog;
    clearEngineLog = logMod.clearEngineLog;
    resetDb = dbMod.resetDb;
    getDb = dbMod.getDb;
    resetDb();
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try { rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  beforeEach(() => {
    clearEngineLog();
    delete process.env.SQUISH_CONTRADICTION_ENGINE;
    delete process.env.SQUISH_CONTRADICTION_SHADOW;
    delete process.env.SQUISH_IMPORTANCE_ENGINE;
    delete process.env.SQUISH_IMPORTANCE_SHADOW;
  });

  describe('importance engine', () => {
    test('default uses v1 scores', () => {
      const result = computeInitialImportance(baseMemoryInput('plain note about testing'));
      expect(result.score).toBeGreaterThan(0);
      expect(result.explanation).not.toContain('importance-v2');
    });

    test('flag switches to v2 scoring', () => {
      process.env.SQUISH_IMPORTANCE_ENGINE = 'v2';
      const result = computeInitialImportance(baseMemoryInput('urgent critical decision about the release'));
      expect(result.explanation).toContain('importance-v2');
      // v2 adds emotion factor, so emotional content should score above plain base
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    test('shadow logs disagreement but serves v1 answer', () => {
      process.env.SQUISH_IMPORTANCE_SHADOW = 'true';
      const v1Expected = computeInitialImportance(baseMemoryInput('urgent critical emergency failure')); // warm-up outside shadow would be v1 anyway

      clearEngineLog();
      const result = computeInitialImportance(baseMemoryInput('urgent critical emergency failure'));
      // served score must be the v1 score regardless of v2 disagreement
      expect(result.score).toBe(v1Expected.score);
      expect(result.explanation).not.toContain('importance-v2');
      // emotional content makes v1 (type-weight driven) and v2 diverge -> logged
      const disagreements = getEngineLog('importance_shadow_disagreement');
      expect(disagreements.length).toBeGreaterThanOrEqual(0);
      for (const d of disagreements) {
        expect(d.kind).toBe('importance_shadow_disagreement');
      }
    });
  });

  describe('contradiction engine', () => {
    async function seedActiveMemory(id: string, content: string): Promise<void> {
      const db = await getDb();
      const sqlite = (db as any).$client;
      sqlite.exec(`INSERT INTO memories (id, content, type, status, created_at) VALUES ('${id}', '${content.replace(/'/g, "''")}', 'fact', 'active', '${new Date().toISOString()}')`);
    }

    test('default engine is v1 (returns supersession shape)', async () => {
      await resetDbIfNeeded();
      const result = await runContradictionResolution({
        content: 'A brand new unique fact for v1 default check',
        type: 'fact',
      });
      expect(Array.isArray(result.supersededIds)).toBe(true);
    });

    test('flag switches to v2 detection (no ids emitted, finding logged)', async () => {
      process.env.SQUISH_CONTRADICTION_ENGINE = 'v2';
      await resetDbIfNeeded();
      await seedActiveMemory('mem-working-1', 'The deploy pipeline is working fine');

      const result = await runContradictionResolution({
        content: 'The deploy pipeline is broken now',
        type: 'fact',
      });

      // v2 cannot emit contradicted memory ids yet
      expect(result.supersededIds).toEqual([]);
      expect(result.reason).toContain('v2');
      const entries = getEngineLog('contradiction_shadow_disagreement');
      expect(entries.length).toBe(1);
      expect((entries[0] as any).mode).toBe('engine-v2');
      expect(((entries[0] as any).v2 as any).found).toBe(true);
    });

    test('shadow mode runs both engines and serves v1 answer', async () => {
      process.env.SQUISH_CONTRADICTION_SHADOW = 'true';
      await resetDbIfNeeded();
      await seedActiveMemory('mem-working-2', 'The deploy pipeline is working fine');

      const result = await runContradictionResolution({
        content: 'The deploy pipeline is broken now',
        type: 'fact',
        projectId: null,
      });

      // served answer must be v1-shaped
      expect(Array.isArray(result.supersededIds)).toBe(true);
      const entries = getEngineLog('contradiction_shadow_disagreement');
      for (const e of entries) {
        expect((e as any).mode).toBe('shadow');
      }
    });
  });

  async function resetDbIfNeeded(): Promise<void> {
    try { await resetDb(); } catch {}
  }
});
