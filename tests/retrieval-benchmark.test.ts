/**
 * Retrieval Pipeline Benchmark
 * Measures latency of each pipeline stage with synthetic data.
 * Run: bun test tests/retrieval-benchmark.test.ts
 */

import { describe, it, expect } from "bun:test";
import { expandQuery } from "../core/retrieval/query-expansion.js";
import { extractQueryEntities, entityBoost } from "../core/retrieval/entity-aware-retrieval.js";
import { detectTemporalReferences, isLikelyStale } from "../core/retrieval/temporal-validity.js";
import { smartMMR } from "../core/retrieval/mmr-diversity.js";
import { enrichContent } from "../core/retrieval/contextual-enrichment.js";
import { getRetrievalConfig } from "../core/retrieval/config.js";

// Synthetic embeddings (768-dim)
function randomEmbedding(): number[] {
  const arr = new Array(768);
  for (let i = 0; i < 768; i++) arr[i] = Math.random() * 2 - 1;
  return arr;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// Generate N synthetic memories with embeddings
function generateMemories(n: number) {
  const query = randomEmbedding();
  const memories = Array.from({ length: n }, (_, i) => ({
    id: `mem-${i}`,
    content: `Memory ${i}: ${i % 3 === 0 ? "bug fix" : i % 3 === 1 ? "feature decision" : "architecture note"} for project squish-memory`,
    embedding: randomEmbedding(),
    memoryType: (["decision", "observation", "fact"] as const)[i % 3],
    tags: i % 2 === 0 ? ["core", "retrieval"] : ["bug", "fix"],
    confidence: 0.5 + Math.random() * 0.5,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    lastAccessedAt: new Date(Date.now() - i * 43200000).toISOString(),
    accessCount: i % 5,
    projectId: "bench",
    sessionId: `sess-${i % 10}`,
    placeId: i % 4 === 0 ? "wip" : undefined,
  }));
  return { query, memories };
}

describe("Retrieval Pipeline Benchmark", () => {
  const SIZES = [50, 200, 1000];

  for (const N of SIZES) {
    it(`Pipeline stages at ${N} memories`, () => {
      const { query, memories } = generateMemories(N);

      // Stage 1: Query expansion
      const t0 = performance.now();
      const expanded = expandQuery("fix bug in hybridSearch reranker");
      const t1 = performance.now();

      // Stage 2: Entity extraction
      const t2 = performance.now();
      const entities = extractQueryEntities("Fix HybridSearch.rerankResults in memories.ts");
      const t3 = performance.now();

      // Stage 3: Cosine similarity (vector search)
      const t4 = performance.now();
      const scored = memories.map((m) => ({
        ...m,
        semanticScore: cosine(query, m.embedding),
      }));
      scored.sort((a, b) => b.semanticScore - a.semanticScore);
      const t5 = performance.now();

      // Stage 4: Entity boost
      const t6 = performance.now();
      const boosted = entityBoost(scored.slice(0, 50), entities);
      const t7 = performance.now();

      // Stage 5: Temporal validity
      const t8 = performance.now();
      const temporal = boosted.map((m) => ({
        ...m,
        temporal: detectTemporalReferences(m.content),
        stale: isLikelyStale(m),
      }));
      const t9 = performance.now();

      // Stage 6: MMR diversity (select top 10 from 50 candidates)
      const t10 = performance.now();
      const mmrInput = temporal.slice(0, 50).map((m) => ({
        ...m,
        score: m.semanticScore,
        embedding: m.embedding,
      })) as any[];
      const diverse = smartMMR(query, mmrInput, { lambda: 0.7, topK: 10 });
      const t11 = performance.now();

      // Stage 7: Final ranking (composite scoring removed in Batch 8 -
      // production ranking is served by scoring v2; benchmark uses raw sim).
      const t12 = performance.now();
      const final = temporal.slice(0, 10).map((m) => ({
        id: m.id,
        score: m.semanticScore,
      }));
      const t13 = performance.now();

      // Summary
      const stages = [
        { name: "Query Expansion", ms: t1 - t0 },
        { name: "Entity Extraction", ms: t3 - t2 },
        { name: `Vector Search (${N} cosine)`, ms: t5 - t4 },
        { name: "Entity Boost (50)", ms: t7 - t6 },
        { name: "Temporal Validity (50)", ms: t9 - t8 },
        { name: "MMR Diversity (50→10)", ms: t11 - t10 },
        { name: "Composite Scoring (10)", ms: t13 - t12 },
      ];

      const total = stages.reduce((s, st) => s + st.ms, 0);

      console.log(`\n--- Benchmark: ${N} memories ---`);
      for (const s of stages) {
        console.log(`  ${s.name}: ${s.ms.toFixed(2)}ms`);
      }
      console.log(`  TOTAL: ${total.toFixed(2)}ms`);

      // Sanity checks
      expect(expanded.length).toBeGreaterThanOrEqual(1);
      expect(entities.length).toBeGreaterThanOrEqual(0);
      expect(scored.length).toBe(N);
      expect(boosted.length).toBeLessThanOrEqual(50);
      expect(diverse.length).toBe(10);
      expect(final.length).toBe(10);
    });
  }
});
