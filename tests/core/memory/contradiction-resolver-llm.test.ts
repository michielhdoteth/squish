/**
 * Tests for the merged contradiction engine in core/memory/contradiction-resolver.ts
 *
 * Covers:
 * - Scenario 7 keyword-opposite detection (absorbed from retired contradiction-v2)
 * - LLM-as-validator wiring (mocked callLLM): veto, confirm, graceful degradation
 * - Proposition-aware end-to-end pipeline shape through resolveContradictions
 *
 * callLLM is mocked with mock.module; config is controlled via env vars
 * (SQUISH_LLM_ENABLED) since config.ts reads env lazily through getters.
 * DB is isolated in a temp dir (SQUISH_DATA_DIR + DATABASE_URL='').
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test';

// ─── Mock the only allowed LLM entrypoint ─────────────────────────────────────
const llmMockState = {
  response: null as string | null,
  calls: [] as string[],
};

mock.module('../../../core/llm/client.js', () => ({
  callLLM: async (prompt: string): Promise<string | null> => {
    llmMockState.calls.push(prompt);
    return llmMockState.response;
  },
  callLLMWithContent: async (): Promise<string | null> => llmMockState.response,
  registerProvider: (): void => {},
  getActiveProviderName: (): string | null => null,
}));

// ─── Env / DB isolation ───────────────────────────────────────────────────────
let testDataDir: string;
let savedEnv: Record<string, string | undefined>;

let detectContradictions: typeof import('../../../core/memory/contradiction-resolver.js').detectContradictions;
let resolveContradictions: typeof import('../../../core/memory/contradiction-resolver.js').resolveContradictions;
let hasOppositeKeywords: typeof import('../../../core/memory/contradiction-resolver.js').hasOppositeKeywords;
let resetDb: typeof import('../../../db/index.js').resetDb;
let getDb: typeof import('../../../db/index.js').getDb;

async function seedActiveMemory(id: string, content: string): Promise<void> {
  const db = await getDb();
  const sqlite = (db as any).$client;
  sqlite.exec(
    `INSERT INTO memories (id, content, type, status, created_at) VALUES ('${id}', '${content.replace(/'/g, "''")}', 'fact', 'active', '${new Date().toISOString()}')`
  );
}

describe('contradiction resolver (merged v1 + keyword opposites + LLM validator)', () => {
  beforeAll(async () => {
    savedEnv = {
      SQUISH_DATA_DIR: process.env.SQUISH_DATA_DIR,
      DATABASE_URL: process.env.DATABASE_URL,
      SQUISH_LLM_ENABLED: process.env.SQUISH_LLM_ENABLED,
      SQUISH_LOCAL_BUNDLED_MODEL: process.env.SQUISH_LOCAL_BUNDLED_MODEL,
    };

    testDataDir = join(tmpdir(), `squish-contradiction-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    process.env.SQUISH_LOCAL_BUNDLED_MODEL = 'off';
    delete process.env.SQUISH_LLM_ENABLED;
    if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

    const resolverMod = await import('../../../core/memory/contradiction-resolver.js');
    const dbMod = await import('../../../db/index.js');
    detectContradictions = resolverMod.detectContradictions;
    resolveContradictions = resolverMod.resolveContradictions;
    hasOppositeKeywords = resolverMod.hasOppositeKeywords;
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

  beforeEach(async () => {
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    llmMockState.calls = [];
    llmMockState.response = null;
    resetDb();
    const db = await getDb();
    const sqlite = (db as any).$client;
    if (sqlite && typeof sqlite.exec === 'function') {
      sqlite.exec('DELETE FROM memory_associations;');
      sqlite.exec('DELETE FROM memories;');
    }
  });

  // ─── Pure helper: hasOppositeKeywords (Scenario 7) ──────────────────────────

  describe('hasOppositeKeywords', () => {
    test('detects yes/no', () => {
      expect(hasOppositeKeywords('The answer is yes', 'The answer is no')).toBe(true);
    });

    test('detects true/false', () => {
      expect(hasOppositeKeywords('The statement is true', 'The statement is false')).toBe(true);
    });

    test('detects always/never', () => {
      expect(hasOppositeKeywords('We always use this approach', 'We never use this approach')).toBe(true);
    });

    test('detects increase/decrease', () => {
      expect(hasOppositeKeywords('Increase the budget', 'Decrease the budget')).toBe(true);
    });

    test('detects up/down', () => {
      expect(hasOppositeKeywords('Prices are going up', 'Prices are going down')).toBe(true);
    });

    test('detects good/bad', () => {
      expect(hasOppositeKeywords('This is a good solution', 'This is a bad solution')).toBe(true);
    });

    test('detects success/failure', () => {
      expect(hasOppositeKeywords('The deployment was a success', 'The deployment was a failure')).toBe(true);
    });

    test('detects working/broken', () => {
      expect(hasOppositeKeywords('The system is working', 'The system is broken')).toBe(true);
    });

    test('is order-independent (pair split across arguments both ways)', () => {
      expect(hasOppositeKeywords('The answer is no', 'The answer is yes')).toBe(true);
      expect(hasOppositeKeywords('The system is broken', 'The system is working')).toBe(true);
    });

    test('is case-insensitive', () => {
      expect(hasOppositeKeywords('YES', 'no')).toBe(true);
    });

    test('whole-word matching avoids substring false positives', () => {
      // 'notice' contains 'no' as substring but not as a whole word
      expect(hasOppositeKeywords('I notice the change', 'The answer is no')).toBe(false);
    });

    test('returns false when no opposite pair present', () => {
      expect(hasOppositeKeywords('The sky is blue', 'The ocean is blue')).toBe(false);
    });
  });

  // ─── LLM-as-validator wiring through detectContradictions ───────────────────

  describe('LLM validator wiring', () => {
    // Heuristic trigger pair: shared words push subjectSimilarity to 4/7 (~0.57 > 0.5),
    // update indicator 'now' fires Scenario 2.
    const EXISTING = 'Sarah lives and works in Austin.';
    const UPDATED = 'Sarah now lives and works in Houston.';

    test('drops heuristic proposal when LLM confidently rejects it', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-austin-1', EXISTING);
      llmMockState.response = '{"contradicts":false,"confidence":0.9}';

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(1);
      // Prompt must be proposition-aware: includes both contents
      expect(llmMockState.calls[0]).toContain(EXISTING);
      expect(llmMockState.calls[0]).toContain(UPDATED);
      expect(llmMockState.calls[0]).toContain('SAME subject AND the SAME attribute');
      // Vetoed: no supersession committed
      expect(result.hasContradiction).toBe(false);
      expect(result.supersededMemories).toEqual([]);
    });

    test('keeps proposal when LLM confirms contradiction', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-austin-2', EXISTING);
      llmMockState.response = '{"contradicts":true,"confidence":0.95}';

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(1);
      expect(result.hasContradiction).toBe(true);
      expect(result.supersededMemories).toEqual(['mem-austin-2']);
      // Scenario 2 confidence: subjectSimilarity(4/7) * 0.85 * temporalFactor(unknown=1.0)
      expect(result.confidence).toBeCloseTo(0.486, 2);
      expect(result.reason).toContain('update to existing information');
      expect(result.associationType).toBe('updates');
    });

    test('keeps proposal on garbage LLM response (graceful degradation)', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-austin-3', EXISTING);
      llmMockState.response = 'not json at all';

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(1);
      expect(result.hasContradiction).toBe(true);
      expect(result.supersededMemories).toEqual(['mem-austin-3']);
    });

    test('keeps proposal on null LLM response (unavailable fallback)', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-austin-4', EXISTING);
      llmMockState.response = null;

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(1);
      expect(result.hasContradiction).toBe(true);
      expect(result.supersededMemories).toEqual(['mem-austin-4']);
    });

    test('parses markdown-fenced JSON robustly (fenced veto drops proposal)', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-austin-5', EXISTING);
      llmMockState.response = '```json\n{"contradicts":false,"confidence":0.9}\n```';

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(1);
      // Fence stripping worked, verdict parsed, proposal dropped
      expect(result.hasContradiction).toBe(false);
      expect(result.supersededMemories).toEqual([]);
    });

    test('LLM disabled: no call attempted, heuristic verdict unchanged', async () => {
      delete process.env.SQUISH_LLM_ENABLED;
      await seedActiveMemory('mem-austin-6', EXISTING);
      // If consulted, this response would veto - proves it was never called
      llmMockState.response = '{"contradicts":false,"confidence":0.9}';

      const result = await detectContradictions({ newContent: UPDATED, newType: 'fact' });

      expect(llmMockState.calls.length).toBe(0);
      expect(result.hasContradiction).toBe(true);
      expect(result.supersededMemories).toEqual(['mem-austin-6']);
    });
  });

  // ─── Scenario 7 end-to-end through detectContradictions ────────────────────

  describe('keyword-opposite scenario through detectContradictions', () => {
    test('opposite keywords supersede with expected confidence and reason', async () => {
      delete process.env.SQUISH_LLM_ENABLED;
      await seedActiveMemory('mem-working-7', 'The deploy pipeline is working fine');

      const result = await detectContradictions({
        newContent: 'The deploy pipeline is broken now',
        newType: 'fact',
      });

      expect(result.hasContradiction).toBe(true);
      expect(result.supersededMemories).toEqual(['mem-working-7']);
      expect(result.confidence).toBeCloseTo(0.7, 2); // 0.7 * temporalFactor(unknown=1.0)
      expect(result.reason).toContain('opposite keywords (working/broken)');
    });

    test('moderate similarity without opposite keywords does not supersede', async () => {
      delete process.env.SQUISH_LLM_ENABLED;
      await seedActiveMemory('mem-blue-sky', 'The sky is blue today');

      const result = await detectContradictions({
        newContent: 'The ocean is blue today',
        newType: 'fact',
      });

      expect(result.hasContradiction).toBe(false);
      expect(result.supersededMemories).toEqual([]);
    });
  });

  // ─── End-to-end proposition case through resolveContradictions ─────────────

  describe('resolveContradictions end-to-end (proposition-aware pipeline shape)', () => {
    test('returns full supersession shape with mocked LLM confirmation', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-e2e-1', 'Sarah lives and works in Austin.');
      llmMockState.response = '{"contradicts":true,"confidence":0.9}';

      const result = await resolveContradictions(
        'Sarah now lives and works in Houston.',
        'fact'
      );

      expect(result.shouldProceed).toBe(true);
      expect(result.supersededIds).toEqual(['mem-e2e-1']);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reason).toBeTruthy();
      expect(result.associationType).toBe('updates'); // explicit replacement via update indicator
      expect(llmMockState.calls.length).toBe(1);
    });

    test('vetoed proposition yields empty supersession but still proceeds', async () => {
      process.env.SQUISH_LLM_ENABLED = 'true';
      await seedActiveMemory('mem-e2e-2', 'Sarah lives and works in Austin.');
      llmMockState.response = '{"contradicts":false,"confidence":0.95}';

      const result = await resolveContradictions(
        'Sarah now lives and works in Houston.',
        'fact'
      );

      expect(result.shouldProceed).toBe(true);
      expect(result.supersededIds).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });
});
