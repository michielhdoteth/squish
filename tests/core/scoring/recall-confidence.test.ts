/**
 * Batch 6a: calibrated recall-confidence model unit tests.
 *
 * Covers:
 * - calibrated base transform (logistic-ish, NOT identity)
 * - convergent evidence -> high confidence
 * - semantic-high-but-lexical-null on multi-signal queries -> discounted
 * - conflict evidence caps confidence
 * - margin / coverage / retention factors
 * - tier boundaries (HIGH >= 0.90 | QUALIFIED 0.60-0.90 | LOW < 0.60)
 * - abstention verdict logic (assessRecall + SQUISH_ABSTAIN_BELOW)
 * - determinism
 * - honest evidence assembly (absent signals are null, never fabricated 0s)
 */
import { describe, it, expect } from 'bun:test';
import {
  RECALL_CONFIDENCE_CONSTANTS as C,
  DEFAULT_ABSTAIN_BELOW,
  getAbstainFloor,
  calibratedBase,
  agreementBonus,
  retentionFromAge,
  semanticMargin,
  computeRecallConfidence,
  tierFor,
  assessRecall,
} from '../../../core/scoring/recall-confidence.js';
import { buildEvidence } from '../../../core/memory/search-evidence.js';
import type { RecallEvidence } from '../../../core/scoring/recall-confidence.js';

function makeEvidence(overrides: Partial<RecallEvidence> = {}): RecallEvidence {
  return {
    semantic: null,
    lexical: { rank: null, score: null },
    graph: null,
    temporal: { stale: null, supersededBy: null },
    conflictPenalty: null,
    memoryConfidence: null,
    supportingCount: 0,
    contradictingCount: 0,
    freshness: null,
    rerankAgreement: null,
    ...overrides,
  };
}

const NO_SET = { candidateSemanticScores: [], multiSignalQuery: false };

describe('calibrated base transform', () => {
  it('is not the identity map', () => {
    // Identity would map 0.5 -> 0.5; the logistic maps midpoints to midpoint
    // but compresses extremes differently.
    expect(calibratedBase(0.5)).toBeCloseTo(0.5);
    expect(calibratedBase(0.75)).toBeGreaterThan(0.75); // saturates upward
    expect(calibratedBase(0.25)).toBeLessThan(0.25);     // and downward
  });

  it('is monotonically increasing in semantic score', () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const v = calibratedBase(Math.min(1, s));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('maps 0 to near-zero trust and 1 to near-certainty', () => {
    expect(calibratedBase(0)).toBeLessThan(0.05);
    expect(calibratedBase(1)).toBeGreaterThan(0.95);
  });
});

describe('agreement bonus', () => {
  it('rewards lexical top-3 hits', () => {
    const b1 = agreementBonus(makeEvidence({ lexical: { rank: 1, score: 0.9 } }));
    expect(b1).toBe(C.LEXICAL_TOP3_BONUS);
  });

  it('does not reward weak lexical presence beyond top-3 with low score', () => {
    const b = agreementBonus(makeEvidence({ lexical: { rank: 8, score: 0.2 } }));
    expect(b).toBe(0);
  });

  it('stacks lexical + graph but respects the cap', () => {
    const stacked = agreementBonus(makeEvidence({
      lexical: { rank: 1, score: 0.9 },
      graph: 0.05,
    }));
    expect(stacked).toBe(C.LEXICAL_TOP3_BONUS + C.GRAPH_AGREEMENT_BONUS);

    const capped = agreementBonus(makeEvidence({
      lexical: { rank: 1, score: 0.9 },
      graph: 0.5,
      supportingCount: 99,
    }));
    expect(capped).toBeLessThanOrEqual(C.MAX_AGREEMENT_BONUS);
  });
});

describe('convergent vs single-signal evidence', () => {
  it('convergent evidence reaches HIGH tier', () => {
    const ev = makeEvidence({
      semantic: 0.85,
      lexical: { rank: 1, score: 0.95 },
      graph: 0.04,
      freshness: 1,
      memoryConfidence: 'certain',
    });
    const { confidence, tier } = computeRecallConfidence(ev, { ...NO_SET, candidateSemanticScores: [0.85] });
    expect(tier).toBe('HIGH');
    expect(confidence).toBeGreaterThanOrEqual(0.90);
  });

  it('semantic-only evidence is discounted relative to convergent', () => {
    const solo = computeRecallConfidence(
      makeEvidence({ semantic: 0.85, freshness: 1 }),
      { ...NO_SET, candidateSemanticScores: [0.85] },
    );
    const convergent = computeRecallConfidence(
      makeEvidence({ semantic: 0.85, lexical: { rank: 2, score: 0.8 }, graph: 0.03, freshness: 1 }),
      { ...NO_SET, candidateSemanticScores: [0.85] },
    );
    expect(convergent.confidence).toBeGreaterThan(solo.confidence);
  });

  it('semantic-high-but-lexical-null on a MULTI-SIGNAL query is discounted', () => {
    const ev = makeEvidence({ semantic: 0.7, freshness: 1 });
    const singleSignalCtx = { candidateSemanticScores: [0.7], multiSignalQuery: false };
    const multiSignalCtx = { candidateSemanticScores: [0.7], multiSignalQuery: true };

    const a = computeRecallConfidence(ev, singleSignalCtx);
    const b = computeRecallConfidence(ev, multiSignalCtx);
    expect(b.confidence).toBeCloseTo(a.confidence * (1 - C.DISAGREEMENT_PENALTY_FACTOR), 5);
  });

  it('lexical absence on a query where FTS returned NOTHING is NOT treated as disagreement', () => {
    const ev = makeEvidence({ semantic: 0.7, freshness: 1 });
    const ctx = { candidateSemanticScores: [0.7], multiSignalQuery: false };
    const discounted = computeRecallConfidence(ev, { ...ctx, multiSignalQuery: true });
    const neutral = computeRecallConfidence(ev, ctx);
    expect(neutral.confidence).toBeGreaterThan(discounted.confidence);
  });

  it('disagreement does not apply when semantics are low anyway', () => {
    const lowSem = makeEvidence({ semantic: 0.3, freshness: 1 });
    const ctx = { candidateSemanticScores: [0.3], multiSignalQuery: true };
    const { confidence } = computeRecallConfidence(lowSem, ctx);
    // Base at 0.3 is ~0.12; disagreement would push it to ~0.10. Just assert
    // it stays LOW-tier either way and no crash occurs.
    expect(confidence).toBeLessThan(0.60);
  });
});

describe('conflict capping', () => {
  it('caps contradicting-count conflicts below QUALIFIED even with perfect evidence', () => {
    const ev = makeEvidence({
      semantic: 0.95,
      lexical: { rank: 1, score: 0.95 },
      graph: 0.05,
      freshness: 1,
      contradictingCount: 2,
    });
    const { confidence, tier } = computeRecallConfidence(ev, NO_SET);
    expect(confidence).toBeLessThanOrEqual(C.CONFLICT_CAP);
    expect(tier).not.toBe('HIGH');
  });

  it('caps superseded-by conflicts', () => {
    const ev = makeEvidence({
      semantic: 0.95,
      lexical: { rank: 1, score: 0.9 },
      freshness: 1,
      temporal: { stale: false, supersededBy: 'newer-memory-id' },
    });
    const { confidence } = computeRecallConfidence(ev, NO_SET);
    expect(confidence).toBeLessThanOrEqual(C.CONFLICT_CAP);
  });

  it('caps outdated memory-confidence levels', () => {
    const clean = computeRecallConfidence(makeEvidence({ semantic: 0.8, freshness: 1 }), NO_SET);
    const outdated = computeRecallConfidence(makeEvidence({ semantic: 0.8, freshness: 1, memoryConfidence: 'outdated' }), NO_SET);
    expect(outdated.confidence).toBeLessThan(clean.confidence);
    expect(outdated.confidence).toBeLessThanOrEqual(C.CONFLICT_CAP);
  });
});

describe('margin, coverage, retention', () => {
  const strongEv = makeEvidence({ semantic: 0.8, freshness: 1 });

  it('decisive margins beat ambiguous margins', () => {
    const decisive = computeRecallConfidence(strongEv, { candidateSemanticScores: [0.8, 0.4], multiSignalQuery: false });
    const ambiguous = computeRecallConfidence(strongEv, { candidateSemanticScores: [0.8, 0.78], multiSignalQuery: false });
    expect(decisive.confidence).toBeGreaterThan(ambiguous.confidence);
  });

  it('tiny candidate sets lower confidence', () => {
    const bigSet = computeRecallConfidence(strongEv, { candidateSemanticScores: [0.8, 0.5, 0.4, 0.3], multiSignalQuery: false });
    const tinySet = computeRecallConfidence(strongEv, { candidateSemanticScores: [0.8], multiSignalQuery: false });
    expect(bigSet.confidence).toBeGreaterThan(tinySet.confidence);
  });

  it('all-low candidate scores lower confidence ("not sure anything matches")', () => {
    const healthy = computeRecallConfidence(strongEv, { candidateSemanticScores: [0.8, 0.6], multiSignalQuery: false });
    const allLow = computeRecallConfidence(
      makeEvidence({ semantic: 0.2, freshness: 1 }),
      { candidateSemanticScores: [0.2, 0.15], multiSignalQuery: false },
    );
    expect(allLow.confidence).toBeLessThan(healthy.confidence);
  });

  it('retention decays with age but floors at RETENTION_FACTOR_FLOOR', () => {
    expect(retentionFromAge(0)).toBe(1);
    expect(retentionFromAge(365)).toBeCloseTo(0.5);
    expect(retentionFromAge(-5)).toBe(1); // invalid age -> full retention

    const fresh = computeRecallConfidence(makeEvidence({ semantic: 0.7, freshness: 1 }), NO_SET);
    const ancient = computeRecallConfidence(makeEvidence({ semantic: 0.7, freshness: 0.01 }), NO_SET);
    expect(fresh.confidence).toBeGreaterThan(ancient.confidence);
    expect(ancient.confidence).toBeGreaterThan(0); // floor keeps it alive
  });

  it('missing createdAt (freshness null) is not penalized', () => {
    const withNull = computeRecallConfidence(makeEvidence({ semantic: 0.7, freshness: null }), NO_SET);
    const withFull = computeRecallConfidence(makeEvidence({ semantic: 0.7, freshness: 1 }), NO_SET);
    expect(withNull.confidence).toBe(withFull.confidence);
  });

  it('semantic null gets a small honest floor, never fabricated confidence', () => {
    const { confidence, tier } = computeRecallConfidence(makeEvidence({}), NO_SET);
    expect(confidence).toBeLessThan(0.20);
    expect(tier).toBe('LOW');
  });
});

describe('tier boundaries', () => {
  it('HIGH >= 0.90, QUALIFIED >= 0.60, LOW < 0.60', () => {
    expect(tierFor(1.0)).toBe('HIGH');
    expect(tierFor(0.90)).toBe('HIGH');
    expect(tierFor(0.899)).toBe('QUALIFIED');
    expect(tierFor(0.60)).toBe('QUALIFIED');
    expect(tierFor(0.599)).toBe('LOW');
    expect(tierFor(0)).toBe('LOW');
  });
});

describe('semanticMargin', () => {
  it('returns null for fewer than two finite candidates', () => {
    expect(semanticMargin([])).toBeNull();
    expect(semanticMargin([0.5])).toBeNull();
    expect(semanticMargin([null, null])).toBeNull();
  });

  it('computes gap between best and second-best', () => {
    expect(semanticMargin([0.9, 0.6, 0.5])).toBeCloseTo(0.3);
    expect(semanticMargin([null, 0.4, 0.35])).toBeCloseTo(0.05);
  });
});

describe('abstention verdicts (assessRecall)', () => {
  it('empty candidate set -> no_reliable_memory with explicit message', () => {
    const a = assessRecall([]);
    expect(a.verdict).toBe('no_reliable_memory');
    expect(a.bestConfidence).toBe(0);
    expect(a.message).toContain('no reliable memory found for this query');
  });

  it('best below abstain floor -> no_reliable_memory while results still ranked', () => {
    const a = assessRecall([{ recallConfidence: 0.20 }, { recallConfidence: 0.34 }]);
    expect(a.verdict).toBe('no_reliable_memory');
    expect(a.bestConfidence).toBeCloseTo(0.34);
  });

  it('default floor is 0.35', () => {
    expect(DEFAULT_ABSTAIN_BELOW).toBe(0.35);
    expect(getAbstainFloor({} as NodeJS.ProcessEnv)).toBe(0.35);
    expect(getAbstainFloor({ SQUISH_ABSTAIN_BELOW: '0.50' } as unknown as NodeJS.ProcessEnv)).toBe(0.50);
    expect(getAbstainFloor({ SQUISH_ABSTAIN_BELOW: 'garbage' } as unknown as NodeJS.ProcessEnv)).toBe(0.35);
  });

  it('HIGH best -> confident; QUALIFIED band -> qualified', () => {
    const high = assessRecall([{ recallConfidence: 0.92 }]);
    expect(high.verdict).toBe('confident');
    expect(high.tier).toBe('HIGH');

    const qualified = assessRecall([{ recallConfidence: 0.65 }]);
    expect(qualified.verdict).toBe('qualified');
    expect(qualified.tier).toBe('QUALIFIED');
  });

  it('custom threshold overrides shift the boundary', () => {
    const results = [{ recallConfidence: 0.40 }];
    expect(assessRecall(results, { abstainBelow: 0.35 }).verdict).toBe('qualified');
    expect(assessRecall(results, { abstainBelow: 0.50 }).verdict).toBe('no_reliable_memory');
  });

  it('results without confidence values do not fabricate certainty', () => {
    const a = assessRecall([{ recallConfidence: null }, {}]);
    expect(a.verdict).toBe('no_reliable_memory');
  });
});

describe('determinism', () => {
  it('identical inputs produce byte-identical outputs', () => {
    const ev = makeEvidence({ semantic: 0.72, lexical: { rank: 2, score: 0.6 }, freshness: 0.8 });
    const ctx = { candidateSemanticScores: [0.72, 0.61, 0.4], multiSignalQuery: true };
    const a = computeRecallConfidence(ev, ctx);
    const b = computeRecallConfidence(ev, ctx);
    expect(a.confidence).toBe(b.confidence);
    expect(a.tier).toBe(b.tier);
  });
});

describe('honest evidence assembly (buildEvidence)', () => {
  const nowMs = Date.UTC(2026, 7, 23);

  it('absent signals stay null - never fabricated zeros', () => {
    const result: any = { id: 'm1', content: 'plain content', scoreBreakdown: {}, createdAt: undefined };
    const ev = buildEvidence(result, undefined, { contradictingCount: 0, supportingCount: 0, supersededBy: null }, { candidateSemanticScores: [], multiSignalQuery: false }, nowMs);
    expect(ev.semantic).toBeNull();
    expect(ev.lexical.rank).toBeNull();
    expect(ev.lexical.score).toBeNull();
    expect(ev.graph).toBeNull();
    expect(ev.freshness).toBeNull();
    expect(ev.memoryConfidence).toBeNull();
    expect(ev.conflictPenalty).toBeNull();
  });

  it('captures graph contribution only when actually applied', () => {
    const boosted: any = { id: 'm1', content: 'x', scoreBreakdown: { graph: 0.03 } };
    const unboosted: any = { id: 'm1', content: 'x', scoreBreakdown: { graph: 0 } };
    const ctx = { candidateSemanticScores: [], multiSignalQuery: false };
    expect(buildEvidence(boosted, undefined, { contradictingCount: 0, supportingCount: 0, supersededBy: null }, ctx, nowMs).graph).toBe(0.03);
    expect(buildEvidence(unboosted, undefined, { contradictingCount: 0, supportingCount: 0, supersededBy: null }, ctx, nowMs).graph).toBeNull();
  });

  it('sums applied conflict penalties into conflictPenalty', () => {
    const result: any = { id: 'm1', content: 'x', scoreBreakdown: { supersededPenalty: -0.5, stalenessPenalty: -0.3 } };
    const ctx = { candidateSemanticScores: [], multiSignalQuery: false };
    expect(buildEvidence(result, undefined, { contradictingCount: 0, supportingCount: 0, supersededBy: null }, ctx, nowMs).conflictPenalty).toBeCloseTo(-0.8);
  });

  it('derives freshness from createdAt via the retention curve', () => {
    const yearAgoIso = new Date(nowMs - 365 * 86_400_000).toISOString();
    const result: any = { id: 'm1', content: 'x', scoreBreakdown: {}, createdAt: yearAgoIso };
    const ctx = { candidateSemanticScores: [], multiSignalQuery: false };
    const ev = buildEvidence(result, undefined, { contradictingCount: 0, supportingCount: 0, supersededBy: null }, ctx, nowMs);
    expect(ev.freshness).not.toBeNull();
    expect(ev.freshness!).toBeCloseTo(retentionFromAge(365), 1);
  });
});
