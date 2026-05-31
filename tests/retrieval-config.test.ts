import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRetrievalConfig, calculateCompositeScore, getEnvRetrievalConfig } from '../core/retrieval/config.js';
import type { SquishRetrievalConfig, RetrievalTrace } from '../core/retrieval/config.js';

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

  it('includeSuperseded defaults to false', () => {
    const cfg = getRetrievalConfig();
    expect(cfg.includeSuperseded).toBe(false);
  });

  it('includeSuperseded can be overridden to true', () => {
    const cfg = getRetrievalConfig({ includeSuperseded: true });
    expect(cfg.includeSuperseded).toBe(true);
  });

  it('supersededPenalty has a sensible default', () => {
    const cfg = getRetrievalConfig();
    expect(cfg.scoring.supersededPenalty).toBe(0.50);
    expect(cfg.scoring.supersededPenalty).toBeGreaterThan(0);
  });
});

describe('getEnvRetrievalConfig', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('reads SQUISH_INCLUDE_SUPERSEDED env var as true', () => {
    process.env.SQUISH_INCLUDE_SUPERSEDED = 'true';
    const envCfg = getEnvRetrievalConfig();
    expect(envCfg.includeSuperseded).toBe(true);
  });

  it('reads SQUISH_INCLUDE_SUPERSEDED env var as false', () => {
    process.env.SQUISH_INCLUDE_SUPERSEDED = 'false';
    const envCfg = getEnvRetrievalConfig();
    expect(envCfg.includeSuperseded).toBe(false);
  });

  it('SQUISH_INCLUDE_SUPERSEDED defaults to undefined when not set', () => {
    delete process.env.SQUISH_INCLUDE_SUPERSEDED;
    const envCfg = getEnvRetrievalConfig();
    expect(envCfg.includeSuperseded).toBeUndefined();
  });

  it('merges env config with defaults', () => {
    process.env.SQUISH_INCLUDE_SUPERSEDED = 'true';
    process.env.SQUISH_SUPERSEDED_PENALTY = '0.75';
    const envCfg = getEnvRetrievalConfig();
    expect(envCfg.includeSuperseded).toBe(true);
    expect(envCfg.scoring?.supersededPenalty).toBe(0.75);
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

describe('RetrievalTrace interface (Phase 8)', () => {
  it('has all required fields', () => {
    // Type-checking test: ensure RetrievalTrace has all required fields
    const trace: RetrievalTrace = {
      selectedPlace: 'wip',
      fallbackUsed: false,
      fallbackPlaces: [],
      matchedPlaces: ['wip', 'inbox'],
      matchedTags: ['test', 'debug'],
      scoreBreakdown: { 'mem-1': 0.8, 'mem-2': 0.6 },
      scoreBreakdowns: [],
      supersededFiltered: 2,
      totalCandidates: 15,
      finalOrder: ['mem-1', 'mem-2', 'mem-3'],
      finalResultCount: 3,
    };

    expect(trace.selectedPlace).toBe('wip');
    expect(trace.fallbackUsed).toBe(false);
    expect(trace.fallbackPlaces).toEqual([]);
    expect(trace.matchedPlaces).toEqual(['wip', 'inbox']);
    expect(trace.matchedTags).toEqual(['test', 'debug']);
    expect(trace.scoreBreakdown).toEqual({ 'mem-1': 0.8, 'mem-2': 0.6 });
    expect(trace.supersededFiltered).toBe(2);
    expect(trace.totalCandidates).toBe(15);
    expect(trace.finalOrder).toEqual(['mem-1', 'mem-2', 'mem-3']);
    expect(trace.finalResultCount).toBe(3);
  });

  it('allows null selectedPlace', () => {
    const trace: RetrievalTrace = {
      selectedPlace: null,
      fallbackUsed: false,
      fallbackPlaces: [],
      matchedPlaces: [],
      matchedTags: [],
      scoreBreakdown: {},
      scoreBreakdowns: [],
      supersededFiltered: 0,
      totalCandidates: 0,
      finalOrder: [],
      finalResultCount: 0,
    };
    expect(trace.selectedPlace).toBeNull();
  });
});

describe('SearchInput trace field (Phase 8)', () => {
  it('has optional trace field', () => {
    // Type-checking test: SearchInput accepts trace boolean
    const input: import('../core/memory/memories.js').SearchInput = {
      query: 'test query',
      trace: true,
    };
    expect(input.trace).toBe(true);
  });

  it('trace defaults to undefined when not specified', () => {
    const input: import('../core/memory/memories.js').SearchInput = {
      query: 'test query',
    };
    expect(input.trace).toBeUndefined();
  });
});
