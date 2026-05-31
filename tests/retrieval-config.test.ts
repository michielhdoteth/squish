import { describe, it, expect } from 'bun:test';
import { getRetrievalConfig, calculateCompositeScore } from '../core/retrieval/config.js';
import type { SquishRetrievalConfig } from '../core/retrieval/config.js';

describe('getRetrievalConfig', () => {
  it('returns default config', () => {
    const cfg = getRetrievalConfig();
    expect(cfg.placeMinWeight).toBe(0.35);
    expect(cfg.minResults).toBe(3);
    expect(cfg.includeSuperseded).toBe(false);
    expect(cfg.tagCap).toBe(12);
    expect(cfg.scoring.placeBoost).toBe(0.15);
  });

  it('merges overrides', () => {
    const cfg = getRetrievalConfig({
      placeMinWeight: 0.5,
      scoring: { placeBoost: 0.25, tagOverlapBoost: 0.15, graphNeighborBoost: 0.1, recencyBoost: 0.05, usageBoost: 0.03, supersededPenalty: 0.6, contradictionRiskPenalty: 0.3 },
    });
    expect(cfg.placeMinWeight).toBe(0.5);
    expect(cfg.scoring.placeBoost).toBe(0.25);
    // Non-overridden values stay default
    expect(cfg.minResults).toBe(3);
  });
});

describe('calculateCompositeScore', () => {
  it('calculates basic score with semantic similarity only', () => {
    const result = calculateCompositeScore({
      semanticSimilarity: 0.8,
      placeMatch: false,
      tagOverlapCount: 0,
      graphNeighborCount: 0,
    });
    expect(result.semanticSimilarity).toBe(0.8);
    expect(result.finalScore).toBeCloseTo(0.8, 1);
  });

  it('adds place boost when place matches', () => {
    const withMatch = calculateCompositeScore({
      semanticSimilarity: 0.6,
      placeMatch: true,
      tagOverlapCount: 0,
      graphNeighborCount: 0,
    });
    const withoutMatch = calculateCompositeScore({
      semanticSimilarity: 0.6,
      placeMatch: false,
      tagOverlapCount: 0,
      graphNeighborCount: 0,
    });
    expect(withMatch.finalScore).toBeGreaterThan(withoutMatch.finalScore);
  });

  it('adds tag overlap boost', () => {
    const result = calculateCompositeScore({
      semanticSimilarity: 0.5,
      placeMatch: false,
      tagOverlapCount: 3,
      graphNeighborCount: 0,
    });
    expect(result.tagOverlapBoost).toBeGreaterThan(0);
    expect(result.finalScore).toBeGreaterThan(0.5);
  });

  it('applies superseded penalty', () => {
    const superseded = calculateCompositeScore({
      semanticSimilarity: 0.8,
      placeMatch: true,
      tagOverlapCount: 2,
      graphNeighborCount: 0,
      isSuperseded: true,
    });
    const notSuperseded = calculateCompositeScore({
      semanticSimilarity: 0.8,
      placeMatch: true,
      tagOverlapCount: 2,
      graphNeighborCount: 0,
      isSuperseded: false,
    });
    expect(superseded.finalScore).toBeLessThan(notSuperseded.finalScore);
  });

  it('clamps final score between 0 and 1', () => {
    const result = calculateCompositeScore({
      semanticSimilarity: 1.0,
      placeMatch: true,
      tagOverlapCount: 10,
      graphNeighborCount: 10,
      createdAt: Date.now(),
      accessCount: 100,
    });
    expect(result.finalScore).toBeLessThanOrEqual(1.0);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('calculates recency boost for recent memories', () => {
    const recent = calculateCompositeScore({
      semanticSimilarity: 0.5,
      placeMatch: false,
      tagOverlapCount: 0,
      graphNeighborCount: 0,
      createdAt: Date.now(),
    });
    const old = calculateCompositeScore({
      semanticSimilarity: 0.5,
      placeMatch: false,
      tagOverlapCount: 0,
      graphNeighborCount: 0,
      createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });
    expect(recent.recencyBoost).toBeGreaterThan(old.recencyBoost);
  });
});
