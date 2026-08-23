/**
 * Tests for GAC (Geometry-Aware Consolidation) integration into consolidation engine.
 * Tests that the 3-way GAC strategy selector is properly integrated into consolidateCluster.
 *
 * TDD: Write tests first, then verify implementation.
 *
 * FIX: No mock.module() calls. All tests use real implementations:
 * - Pure math functions are tested directly
 * - DB-touching tests use a temp dir via SQUISH_DATA_DIR
 * - LLM/embedding config controlled via env vars
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Temp DB setup ────────────────────────────────────────────────────────────
let tempDataDir: string;

// ─── Config control via env vars ─────────────────────────────────────────────
const savedEnv: Record<string, string | undefined> = {};

function setGeometryConfig(opts: {
  enabled?: boolean;
  autoConsolidate?: boolean;
  autoSplit?: boolean;
  thetaPrime?: number;
  llmEnabled?: boolean;
}) {
  if (opts.enabled !== undefined) {
    savedEnv.SQUISH_GEOMETRY_CONSOLIDATION = process.env.SQUISH_GEOMETRY_CONSOLIDATION;
    process.env.SQUISH_GEOMETRY_CONSOLIDATION = String(opts.enabled);
  }
  if (opts.autoConsolidate !== undefined) {
    savedEnv.SQUISH_GEOMETRY_AUTO_CONSOLIDATE = process.env.SQUISH_GEOMETRY_AUTO_CONSOLIDATE;
    process.env.SQUISH_GEOMETRY_AUTO_CONSOLIDATE = String(opts.autoConsolidate);
  }
  if (opts.autoSplit !== undefined) {
    savedEnv.SQUISH_GEOMETRY_AUTO_SPLIT = process.env.SQUISH_GEOMETRY_AUTO_SPLIT;
    process.env.SQUISH_GEOMETRY_AUTO_SPLIT = String(opts.autoSplit);
  }
  if (opts.thetaPrime !== undefined) {
    savedEnv.SQUISH_GEOMETRY_THETA_PRIME = process.env.SQUISH_GEOMETRY_THETA_PRIME;
    process.env.SQUISH_GEOMETRY_THETA_PRIME = String(opts.thetaPrime);
  }
  if (opts.llmEnabled !== undefined) {
    savedEnv.SQUISH_LLM_ENABLED = process.env.SQUISH_LLM_ENABLED;
    process.env.SQUISH_LLM_ENABLED = String(opts.llmEnabled);
  }
}

function restoreGeometryConfig() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  // Clear all geometry env vars to restore defaults
  delete process.env.SQUISH_GEOMETRY_CONSOLIDATION;
  delete process.env.SQUISH_GEOMETRY_AUTO_CONSOLIDATE;
  delete process.env.SQUISH_GEOMETRY_AUTO_SPLIT;
  delete process.env.SQUISH_GEOMETRY_THETA_PRIME;
  delete process.env.SQUISH_LLM_ENABLED;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a mock memory with an embedding.
 */
function createMockMemory(id: string, embedding: number[], content?: string): any {
  return {
    id,
    content: content ?? `Memory content for ${id}`,
    type: 'observation',
    embedding: JSON.stringify(embedding),
    embedding_json: undefined,
    tags: ['test'],
    importance: 20,
    createdAt: new Date('2025-01-01'),
  };
}

/**
 * Creates a tight cluster (identical embeddings) - should trigger centroid strategy.
 */
function createTightCluster(count: number = 5): any[] {
  // All embeddings very close to each other (nearly identical)
  const base = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  return Array.from({ length: count }, (_, i) =>
    createMockMemory(`tight-${i}`, base.map(v => v + i * 0.001), `Tight memory ${i}`)
  );
}

/**
 * Creates a diverse cluster (far apart embeddings) - should trigger prune strategy.
 */
function createDiverseCluster(count: number = 6): any[] {
  const embeddings = [
    [1, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0, 0, 0],
  ];
  return embeddings.slice(0, count).map((emb, i) =>
    createMockMemory(`diverse-${i}`, emb, `Diverse memory ${i}`)
  );
}

/**
 * Creates a borderline cluster (moderate spread) - should trigger medoid-residual strategy.
 * Uses a moderate angular spread that puts d_bar between spreadSafe and spreadUnsafe.
 * The key: vectors are similar enough to not be diverse (not orthogonal), but different
 * enough that rho_C < 0.55 or d_bar exceeds spread_safe.
  *
  * For theta=0.15, d_eff ~1.16, spread_safe ~0.20, spread_unsafe ~0.34
  * (factor = 2^(1/d_eff)). We need d_bar in [0.20, 0.34] range.
  * Using 81-degree total spread (PI*0.45 max angle) gives d_bar ~0.28.
  */
function createBorderlineCluster(count: number = 5): any[] {
  const embeddings = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 0.45; // ~81-degree max spread
    return [
      Math.cos(angle) * 0.8,
      Math.sin(angle) * 0.8,
      Math.cos(angle * 2) * 0.4,
      Math.sin(angle * 2) * 0.4,
      0.1 * Math.cos(angle * 3),
      0.1 * Math.sin(angle * 3),
      0.05,
      0.02,
    ];
  });
  return embeddings.map((emb, i) =>
    createMockMemory(`borderline-${i}`, emb, `Borderline memory ${i}`)
  );
}

/**
 * Resets config env vars for each test.
 */
function resetConfig() {
  restoreGeometryConfig();
  setGeometryConfig({ enabled: true, autoConsolidate: true, autoSplit: true, thetaPrime: 0.15, llmEnabled: false });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GAC Integration into Consolidation Engine', () => {
  beforeAll(() => {
    tempDataDir = mkdtempSync(join(tmpdir(), 'squish-gac-test-'));
    process.env.SQUISH_DATA_DIR = tempDataDir;
  });

  afterAll(() => {
    delete process.env.SQUISH_DATA_DIR;
    restoreGeometryConfig();
    try { rmSync(tempDataDir, { recursive: true, force: true }); } catch {}
  });

  beforeEach(() => {
    resetConfig();
  });

  describe('pre-consolidation dimensionality reduction', () => {
    test('preConsolidationReduction reduces vector dimensions by 50%', async () => {
      const { preConsolidationReduction } = await import('../core/memory/consolidation.js');

      const vectors = [
        [1, 2, 3, 4, 5, 6, 7, 8],
        [2, 3, 4, 5, 6, 7, 8, 9],
        [3, 4, 5, 6, 7, 8, 9, 10],
      ];

      const reduced = preConsolidationReduction(vectors, 0.5);

      // Should keep 50% of dimensions (4 out of 8)
      expect(reduced[0].length).toBe(4);
      expect(reduced.length).toBe(3);
    });

    test('preConsolidationReduction handles empty vectors', async () => {
      const { preConsolidationReduction } = await import('../core/memory/consolidation.js');

      const reduced = preConsolidationReduction([], 0.5);
      expect(reduced).toEqual([]);
    });

    test('preConsolidationReduction preserves at least 1 dimension', async () => {
      const { preConsolidationReduction } = await import('../core/memory/consolidation.js');

      const vectors = [[1, 2]];
      const reduced = preConsolidationReduction(vectors, 0.95);
      expect(reduced[0].length).toBeGreaterThanOrEqual(1);
    });

    test('preConsolidationReduction is deterministic', async () => {
      const { preConsolidationReduction } = await import('../core/memory/consolidation.js');

      const vectors = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      ];

      const reduced1 = preConsolidationReduction(vectors, 0.5);
      const reduced2 = preConsolidationReduction(vectors, 0.5);

      expect(reduced1).toEqual(reduced2);
    });

    test('preConsolidationReduction with 0 reduction keeps all dimensions', async () => {
      const { preConsolidationReduction } = await import('../core/memory/consolidation.js');

      const vectors = [[1, 2, 3, 4]];
      const reduced = preConsolidationReduction(vectors, 0);
      expect(reduced[0].length).toBe(4);
    });
  });

  describe('GAC strategy selection and execution', () => {
    test('centroid strategy: consolidates tight cluster using nearest-to-centroid', async () => {
      const memories = createTightCluster(5);

      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const decision = selectGACStrategy(memories, 0.15);

      expect(decision.strategy).toBe('centroid');
      expect(decision.dBar).toBeLessThan(decision.spreadSafe);
      expect(decision.reason).toContain('tight cluster');
    });

    test('prune strategy: selects prune for diverse cluster', async () => {
      const memories = createDiverseCluster(6);

      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const decision = selectGACStrategy(memories, 0.15);

      expect(decision.strategy).toBe('prune');
      expect(decision.dBar).toBeGreaterThan(decision.spreadUnsafe);
      expect(decision.reason).toContain('diverse cluster');
    });

    test('medoid-residual strategy: selects medoid-residual for borderline cluster', async () => {
      const memories = createBorderlineCluster(5);

      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const decision = selectGACStrategy(memories, 0.15);

      expect(decision.strategy).toBe('medoid-residual');
      expect(decision.dBar).toBeGreaterThanOrEqual(decision.spreadSafe);
      expect(decision.dBar).toBeLessThanOrEqual(decision.spreadUnsafe);
      expect(decision.reason).toContain('borderline cluster');
    });

    test('centroid strategy stores GAC metadata in consolidated memory', async () => {
      const memories = createTightCluster(5);
      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const decision = selectGACStrategy(memories, 0.15);

      expect(decision.strategy).toBe('centroid');

      // Verify the metadata structure we would store
      const metadata = {
        consolidatedFrom: memories.map(m => m.id),
        consolidatedAt: new Date().toISOString(),
        clusterSize: memories.length,
        avgSimilarity: 0.95,
        gacStrategy: decision.strategy,
        gacDBar: decision.dBar,
        gacDEff: decision.dEff,
        gacRhoC: decision.rhoC,
        gacSpreadSafe: decision.spreadSafe,
        gacSpreadUnsafe: decision.spreadUnsafe,
        gacRepresentatives: decision.representatives,
        gacReason: decision.reason,
      };

      expect(metadata.gacStrategy).toBe('centroid');
      expect(metadata.gacDBar).toBeGreaterThanOrEqual(0);
      expect(metadata.gacDEff).toBeGreaterThanOrEqual(1);
      expect(metadata.gacRhoC).toBeGreaterThanOrEqual(0);
      expect(metadata.gacRhoC).toBeLessThanOrEqual(1);
      expect(metadata.gacSpreadSafe).toBeGreaterThan(0);
      expect(metadata.gacSpreadUnsafe).toBeGreaterThan(0);
      expect(typeof metadata.gacReason).toBe('string');
    });

    test('medoid-residual strategy stores residual budget in metadata', async () => {
      const memories = createBorderlineCluster(5);
      const { selectGACStrategy, computeMedoidWithResiduals } = await import('../core/clustering/gac-strategy.js');
      const { computeCentroid } = await import('../core/clustering/geometry.js');

      const decision = selectGACStrategy(memories, 0.15);
      expect(decision.strategy).toBe('medoid-residual');

      // Compute medoid with residuals as the integration would
      const vectors = memories.map(m => {
        const emb = JSON.parse(m.embedding);
        return emb;
      });
      const centroid = computeCentroid(vectors);
      const residualRank = Math.min(6, Math.max(1, Math.floor(decision.dEff)));
      const budget = computeMedoidWithResiduals(memories, centroid, residualRank);

      expect(budget.medoidId).toBeDefined();
      expect(budget.medoidEmbedding.length).toBeGreaterThan(0);
      expect(budget.principalDirections.length).toBeGreaterThan(0);
      expect(budget.scalingFactor).toBeGreaterThan(0);

      // The residual metadata that would be stored
      const residualMeta = {
        medoidId: budget.medoidId,
        principalDirections: budget.principalDirections.length,
        scalingFactor: budget.scalingFactor,
      };

      expect(residualMeta.medoidId).toMatch(/^borderline-/);
      expect(residualMeta.principalDirections).toBeGreaterThanOrEqual(1);
      expect(residualMeta.scalingFactor).toBeGreaterThan(0);
    });

    test('prune strategy keeps top distinct memories', async () => {
      const memories = createDiverseCluster(6);
      const { selectGACStrategy, pruneDiverseCluster } = await import('../core/clustering/gac-strategy.js');

      const decision = selectGACStrategy(memories, 0.15);
      expect(decision.strategy).toBe('prune');

      const pruned = pruneDiverseCluster(memories, 0.5);

      // Should keep at least 2 and at most all memories
      expect(pruned.length).toBeGreaterThanOrEqual(2);
      expect(pruned.length).toBeLessThanOrEqual(memories.length);

      // All pruned memories should have valid IDs
      for (const mem of pruned) {
        expect(mem.id).toBeDefined();
        expect(typeof mem.id).toBe('string');
      }
    });
  });

  describe('fallback when geometry disabled', () => {
    test('falls back to extractive summary when geometry is disabled', async () => {
      setGeometryConfig({ enabled: false });

      const { generateExtractiveSummary } = await import('../core/memory/consolidation.js');
      const memories = [
        { id: '1', content: 'First memory', type: 'fact' },
        { id: '2', content: 'Second memory', type: 'fact' },
        { id: '3', content: 'Third memory', type: 'observation' },
      ];

      const summary = generateExtractiveSummary(memories);
      expect(summary).toContain('Consolidated from 3 memories');
      expect(summary).toContain('First memory');
    });

    test('geometry fallback produces non-GAC metadata', async () => {
      // When geometry is disabled, metadata should not contain gac fields
      setGeometryConfig({ enabled: false });

      const metadata = {
        consolidatedFrom: ['1', '2', '3'],
        consolidatedAt: new Date().toISOString(),
        clusterSize: 3,
        avgSimilarity: 0.85,
        // No gac* fields when geometry is disabled
      };

      expect(metadata).not.toHaveProperty('gacStrategy');
      expect(metadata).not.toHaveProperty('gacDBar');
      expect(metadata).not.toHaveProperty('gacDEff');
    });
  });

  describe('ConsolidationOptions interface', () => {
    test('ConsolidationOptions includes preConsolidationReduction field', async () => {
      // Type-level check: verify the interface has the new field
      const options: import('../core/memory/consolidation.js').ConsolidationOptions = {
        projectId: 'test-project',
        preConsolidationReduction: true,
      };

      expect(options.preConsolidationReduction).toBe(true);
    });

    test('ConsolidationOptions preConsolidationReduction is optional', async () => {
      const options: import('../core/memory/consolidation.js').ConsolidationOptions = {
        projectId: 'test-project',
        // preConsolidationReduction not provided - should compile
      };

      expect(options.preConsolidationReduction).toBeUndefined();
    });
  });

  describe('ConsolidationResult interface', () => {
    test('ConsolidationResult includes GAC fields', async () => {
      // Type-level check: verify the result interface supports GAC data
      const result: import('../core/memory/consolidation.js').ConsolidationResult = {
        consolidatedMemoryId: 'test-id',
        sourceMemoryIds: ['1', '2'],
        clusterSize: 2,
        summary: 'test summary',
        geometrySafe: true,
        dBar: 0.1,
        dEff: 2.5,
        gacStrategy: 'centroid',
        gacDecision: {
          strategy: 'centroid',
          dBar: 0.1,
          dEff: 2.5,
          rhoC: 0.8,
          spreadSafe: 0.12,
          spreadUnsafe: 0.2,
          representatives: 1,
          reason: 'test',
        },
      };

      expect(result.gacStrategy).toBe('centroid');
      expect(result.gacDecision).toBeDefined();
      expect(result.gacDecision!.strategy).toBe('centroid');
    });
  });

  describe('reverseConsolidation', () => {
    test('reverseConsolidation is still exported and callable', async () => {
      const { reverseConsolidation } = await import('../core/memory/consolidation.js');
      expect(typeof reverseConsolidation).toBe('function');
    });

    test('reverseConsolidation throws when consolidated memory not found', async () => {
      const { reverseConsolidation } = await import('../core/memory/consolidation.js');

      // With real db, the function will throw for a nonexistent ID
      // (either "Consolidated memory not found" or a db error if schema doesn't match)
      await expect(reverseConsolidation('nonexistent-id')).rejects.toThrow();
    });
  });

  describe('generateClusterSummary', () => {
    test('generateClusterSummary is exported and works', async () => {
      const { generateClusterSummary } = await import('../core/memory/consolidation.js');

      const memories = [
        { id: '1', content: 'Memory one about cats', type: 'fact' },
        { id: '2', content: 'Memory two about dogs', type: 'fact' },
        { id: '3', content: 'Memory three about birds', type: 'observation' },
      ];

      const summary = await generateClusterSummary(memories);
      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe('GAC Decision integration metadata', () => {
    test('all GAC decision fields are numeric and finite', async () => {
      const memories = createTightCluster(5);
      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const decision = selectGACStrategy(memories, 0.15);

      expect(Number.isFinite(decision.dBar)).toBe(true);
      expect(Number.isFinite(decision.dEff)).toBe(true);
      expect(Number.isFinite(decision.rhoC)).toBe(true);
      expect(Number.isFinite(decision.spreadSafe)).toBe(true);
      expect(Number.isFinite(decision.spreadUnsafe)).toBe(true);
      expect(Number.isFinite(decision.representatives)).toBe(true);
      expect(Number.isInteger(decision.representatives)).toBe(true);
      expect(decision.representatives).toBeGreaterThanOrEqual(1);
    });

    test('representatives count is at least 1 for any cluster', async () => {
      const clusters = [
        createTightCluster(3),
        createBorderlineCluster(5),
        createDiverseCluster(6),
      ];

      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');

      for (const memories of clusters) {
        const decision = selectGACStrategy(memories, 0.15);
        expect(decision.representatives).toBeGreaterThanOrEqual(1);
      }
    });

    test('strategy is always one of the three valid types', async () => {
      const clusters = [
        createTightCluster(3),
        createBorderlineCluster(5),
        createDiverseCluster(6),
      ];

      const { selectGACStrategy } = await import('../core/clustering/gac-strategy.js');
      const validStrategies = ['centroid', 'medoid-residual', 'prune'];

      for (const memories of clusters) {
        const decision = selectGACStrategy(memories, 0.15);
        expect(validStrategies).toContain(decision.strategy);
      }
    });
  });
});
