/**
 * Batch B1+B2: topical alignment unit tests + recall-confidence integration.
 *
 * Covers:
 * - parseQueryTopic pattern families (what/which + does, bare did, where,
 *   possessive, of-phrases, who-identity, who-verb, identity single token)
 * - parseMemoryTopic declarative forms (birthplace/phone/location/employer)
 * - attribute bucket normalization (device->phone, resides->location,
 *   born->birthplace distinct from location)
 * - topicalAlignment truth table (1 / 0.7 / 0 / null)
 * - computeRecallConfidence: mismatch discounts AFTER agreement so bonuses
 *   cannot resurrect trust; null alignment is byte-neutral vs baseline
 * - assessRecall: mismatch-penalized best confidence flips the verdict to
 *   no_reliable_memory
 * - honest evidence assembly: absent query topic -> alignment stays null
 *
 * Integration (temp-dir SQLite, same isolation as other integration tests):
 * - seed only a birth record for Kenji -> phone query must abstain
 * - seed the actual phone fact -> phone query becomes confident and the
 *   iPhone memory carries the highest recall confidence
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, rmSync } from 'fs';

import {
  parseQueryTopic,
  parseMemoryTopic,
  topicalAlignment,
  topicsAboutSameEntity,
  TOPIC_ATTRIBUTE_BUCKETS,
  type QueryTopic,
} from '../../../core/scoring/topical-alignment.js';
import {
  RECALL_CONFIDENCE_CONSTANTS as C,
  DEFAULT_ABSTAIN_BELOW,
  computeRecallConfidence,
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
    topicalAlignment: null,
    ...overrides,
  };
}

const HEALTHY_CTX = { candidateSemanticScores: [0.95, 0.6, 0.5], multiSignalQuery: false };
/** Decisive-but-unclamped context: neutral margin factor, >= MIN_COVERAGE_SET_SIZE candidates. */
const MARGIN_NEUTRAL_CTX = { candidateSemanticScores: [0.95, 0.8, 0.5], multiSignalQuery: false };

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

describe('parseQueryTopic', () => {
  it('parses "What <noun phrase> does X <verb>?"', () => {
    expect(parseQueryTopic('What phone does Kenji use?')).toEqual({ entity: 'kenji', attribute: 'phone' });
    expect(parseQueryTopic('What car does Dmitri want to buy?')).toEqual({ entity: 'dmitri', attribute: 'car' });
    expect(parseQueryTopic('Which instruments does Gustav play?')).toEqual({
      entity: 'gustav',
      attribute: 'instrument',
    });
  });

  it('parses the bare "What did X <verb>?" form without an interrogative noun phrase', () => {
    expect(parseQueryTopic('What did June study?')).toEqual({ entity: 'june', attribute: 'school' });
  });

  it('parses where-questions into location-family attributes', () => {
    expect(parseQueryTopic('Where does June live now?')).toEqual({ entity: 'june', attribute: 'location' });
    // A concrete noun inside the where-question overrides plain location.
    expect(parseQueryTopic('Where did Tomas go to primary school?')).toEqual({ entity: 'tomas', attribute: 'school' });
    expect(parseQueryTopic('Where does Tomas work?')).toEqual({ entity: 'tomas', attribute: 'employer' });
  });

  it('routes growing-up and birth where-questions to birthplace, not location', () => {
    expect(parseQueryTopic('Where did Kenji grow up?')).toEqual({ entity: 'kenji', attribute: 'birthplace' });
    expect(parseQueryTopic('Where was Kenji born?')).toEqual({ entity: 'kenji', attribute: 'birthplace' });
  });

  it('parses possessive forms including apostrophe-stripped corpus spellings', () => {
    expect(parseQueryTopic('What is Marisol favorite wine?')).toEqual({ entity: 'marisol', attribute: 'drink' });
    expect(parseQueryTopic('What is Ivan salary?')).toEqual({ entity: 'ivan', attribute: 'salary' });
    expect(parseQueryTopic('What is Priyas shoe size?')).toEqual({ entity: 'priya', attribute: 'shoe size' });
    expect(parseQueryTopic('What is Fatimas favorite color?')).toEqual({ entity: 'fatima', attribute: 'color' });
    expect(parseQueryTopic("What are Tomas Lindqvist's responsibilities?")).toEqual({
      entity: 'tomas lindqvist',
      attribute: 'responsibilities',
    });
  });

  it('parses "What is the <attr> of <Entity>?" inversions', () => {
    expect(parseQueryTopic('What is the salary of Ivan?')).toEqual({ entity: 'ivan', attribute: 'salary' });
  });

  it('treats single-token "What is X?" as an identity query with no comparable attribute', () => {
    expect(parseQueryTopic('What is PaperTrail?')).toEqual({ entity: 'papertrail', attribute: null });
  });

  it('parses who-questions with person as the queried attribute', () => {
    expect(parseQueryTopic('Who leads Project Aurora?')).toEqual({ entity: 'project aurora', attribute: 'person' });
    expect(parseQueryTopic('Who is Elena Vasquez?')).toEqual({ entity: 'elena vasquez', attribute: 'person' });
  });

  it('returns honest nulls for unparseable queries instead of guessing', () => {
    expect(parseQueryTopic('Why did we pick a relational database over a document store?')).toEqual({
      entity: null,
      attribute: null,
    });
    expect(parseQueryTopic('Tell me about Helios Research Lab.')).toEqual({ entity: null, attribute: null });
    // Lowercase subjects are not reliable entities.
    expect(parseQueryTopic('What do we use for tracing across services?')).toEqual({ entity: null, attribute: null });
    expect(parseQueryTopic('')).toEqual({ entity: null, attribute: null });
  });
});

// ---------------------------------------------------------------------------
// Memory parsing
// ---------------------------------------------------------------------------

describe('parseMemoryTopic', () => {
  it('extracts birthplace facts', () => {
    expect(parseMemoryTopic('Kenji was born in Tokyo.')).toEqual({ entity: 'kenji', attribute: 'birthplace' });
  });

  it('maps the use-verb to the phone/device bucket', () => {
    expect(parseMemoryTopic('Kenji uses an iPhone.')).toEqual({ entity: 'kenji', attribute: 'phone' });
  });

  it('extracts current-residence facts as location', () => {
    expect(parseMemoryTopic('Ivan lives in a two-bedroom apartment in Riga.')).toEqual({
      entity: 'ivan',
      attribute: 'location',
    });
  });

  it('extracts employer facts', () => {
    expect(parseMemoryTopic('Tomas has worked at the fisheries institute since 2015.')).toEqual({
      entity: 'tomas',
      attribute: 'employer',
    });
  });

  it('reads first-person childhood sentences around the place, not the gerund', () => {
    expect(parseMemoryTopic('Growing up in Kyoto shaped my early years.')).toEqual({
      entity: 'kyoto',
      attribute: 'birthplace',
    });
  });

  it('finds mid-sentence proper nouns when the sentence opens with first-person framing', () => {
    expect(parseMemoryTopic('My surgical residency at Johns Hopkins keeps me busy.')).toEqual({
      entity: 'johns hopkins',
      attribute: 'employer',
    });
  });

  it('only reads the first sentence so trailing clauses cannot hijack the subject', () => {
    const t = parseMemoryTopic(
      'Project Aurora is our retrieval harness; Priya Nair leads it and the goal is reproducible benchmarks.'
    );
    expect(t.entity).toBe('project aurora');
  });

  it('returns nulls for empty or entity-free content', () => {
    expect(parseMemoryTopic('')).toEqual({ entity: null, attribute: null });
    expect(parseMemoryTopic('It was raining all afternoon.')).toEqual({ entity: null, attribute: null });
  });
});

// ---------------------------------------------------------------------------
// Bucket normalization
// ---------------------------------------------------------------------------

describe('attribute bucket normalization', () => {
  it('normalizes synonyms onto canonical buckets', () => {
    expect(TOPIC_ATTRIBUTE_BUCKETS).toContain('phone');
    expect(TOPIC_ATTRIBUTE_BUCKETS).toContain('location');
    expect(TOPIC_ATTRIBUTE_BUCKETS).toContain('birthplace');
    // device -> phone bucket via query normalization
    expect(parseQueryTopic('What device does Kenji use?').attribute).toBe('phone');
    // resides -> location bucket on the memory side
    expect(parseMemoryTopic('Ivan resides in Riga with his family.').attribute).toBe('location');
  });

  it('keeps born (birthplace) distinct from lives-now (location)', () => {
    const locationQuery: QueryTopic = { entity: 'june', attribute: 'location' };
    const birthMemory: QueryTopic = { entity: 'june', attribute: 'birthplace' };
    // Born-vs-lives-now are different facts about the same person.
    expect(topicalAlignment(locationQuery, birthMemory)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Alignment truth table
// ---------------------------------------------------------------------------

describe('topicalAlignment truth table', () => {
  it('entity match + attribute match -> 1', () => {
    expect(topicalAlignment(
      { entity: 'kenji', attribute: 'phone' },
      { entity: 'kenji', attribute: 'phone' }
    )).toBe(1);
  });

  it('entity match + attribute mismatch -> 0 (the target case)', () => {
    expect(topicalAlignment(
      { entity: 'kenji', attribute: 'phone' },
      { entity: 'kenji', attribute: 'birthplace' }
    )).toBe(0);
  });

  it('entity mismatch -> 0 regardless of attributes', () => {
    expect(topicalAlignment(
      { entity: 'hana', attribute: 'movie' },
      { entity: 'kyoto', attribute: 'movie' }
    )).toBe(0);
  });

  it('any null on either side -> null (never penalize what cannot be parsed)', () => {
    expect(topicalAlignment(
      { entity: null, attribute: 'phone' },
      { entity: 'kenji', attribute: 'phone' }
    )).toBeNull();
    expect(topicalAlignment(
      { entity: 'kenji', attribute: null },
      { entity: 'kenji', attribute: 'phone' }
    )).toBeNull();
    expect(topicalAlignment(
      { entity: 'kenji', attribute: 'phone' },
      { entity: null, attribute: null }
    )).toBeNull();
  });

  it('attribute containment -> 0.7 partial credit', () => {
    expect(topicalAlignment(
      { entity: 'maria', attribute: 'favorite color' },
      { entity: 'maria', attribute: 'color' }
    )).toBe(0.7);
  });

  it('entity matching is case-insensitive containment-based', () => {
    expect(topicsAboutSameEntity('Elena Vasquez', 'dr elena vasquez')).toBe(true);
    expect(topicsAboutSameEntity('kenji', 'kimura')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRecallConfidence integration (B1 factors + B2 coverage)
// ---------------------------------------------------------------------------

describe('computeRecallConfidence with topical alignment', () => {
  /** Strong convergent evidence: high semantics + lexical top-3 agreement. */
  function strongEvidence(alignment: number | null): RecallEvidence {
    return makeEvidence({
      semantic: 0.95,
      lexical: { rank: 1, score: 0.95 },
      freshness: 1,
      memoryConfidence: 'certain',
      topicalAlignment: alignment,
    });
  }

  it('alignment 0 drives strong evidence below ~0.45 even with full agreement bonuses', () => {
    const { confidence } = computeRecallConfidence(strongEvidence(0), HEALTHY_CTX);
    expect(confidence).toBeLessThanOrEqual(0.45);
  });

  it('alignment null leaves identical evidence above 0.9 (neutrality contract)', () => {
    const { confidence } = computeRecallConfidence(strongEvidence(null), HEALTHY_CTX);
    expect(confidence).toBeGreaterThan(0.9);
  });

  it('alignment 1 is exactly neutral versus baseline (no alignment field set)', () => {
    const baseline = computeRecallConfidence(strongEvidence(null), HEALTHY_CTX);
    const aligned = computeRecallConfidence(strongEvidence(1), HEALTHY_CTX);
    expect(aligned.confidence).toBe(baseline.confidence);
    expect(aligned.tier).toBe(baseline.tier);
  });

  it('partial overlap (0.7) discounts mildly relative to baseline', () => {
    // Mid-range semantics keep the baseline strictly below the clamp so the
    // exact multiplicative relation is observable.
    const mid = makeEvidence({ semantic: 0.85, freshness: 1, memoryConfidence: 'certain', topicalAlignment: null });
    const partial = makeEvidence({ semantic: 0.85, freshness: 1, memoryConfidence: 'certain', topicalAlignment: 0.7 });
    const baseline = computeRecallConfidence(mid, MARGIN_NEUTRAL_CTX);
    const discounted = computeRecallConfidence(partial, MARGIN_NEUTRAL_CTX);
    expect(baseline.confidence).toBeLessThan(1);
    expect(discounted.confidence).toBeCloseTo(baseline.confidence * C.TOPICAL_PARTIAL_FACTOR, 5);
  });

  it('applies the mismatch AFTER agreement so bonuses cannot resurrect trust', () => {
    // Max out every additive bonus: lexical top-3 + graph boost.
    const maxed = makeEvidence({
      semantic: 0.99,
      lexical: { rank: 1, score: 1 },
      graph: 0.05,
      freshness: 1,
      memoryConfidence: 'certain',
      topicalAlignment: 0,
    });
    const { confidence } = computeRecallConfidence(maxed, MARGIN_NEUTRAL_CTX);
    // base(0.99) + capped bonuses saturates at 1.0 pre-factor; with a neutral
    // margin factor the mismatch multiply alone bounds final trust.
    expect(confidence).toBeCloseTo(C.TOPICAL_MISMATCH_FACTOR, 5);
    expect(confidence).toBeLessThan(C.TIER_QUALIFIED_MIN);
  });

  it('topic-absent coverage multiplies an extra factor when ALL candidate alignments are 0', () => {
    const alone = computeRecallConfidence(strongEvidence(0), HEALTHY_CTX);
    const covered = computeRecallConfidence(strongEvidence(0), { ...HEALTHY_CTX, candidateAlignments: [0] });
    const mixed = computeRecallConfidence(strongEvidence(0), { ...HEALTHY_CTX, candidateAlignments: [0, 1] });
    const allNull = computeRecallConfidence(strongEvidence(0), { ...HEALTHY_CTX, candidateAlignments: [null, null] });

    expect(covered.confidence).toBeCloseTo(alone.confidence * C.COVERAGE_TOPIC_ABSENT_FACTOR, 5);
    // A single aligned-1 sibling proves the corpus CAN address the attribute.
    expect(mixed.confidence).toBe(alone.confidence);
    // Nothing computable anywhere -> neutral (no fabricated coverage signal).
    expect(allNull.confidence).toBe(alone.confidence);
  });

  it('assessRecall flips a mismatch-penalized best result to no_reliable_memory', () => {
    const penalized = computeRecallConfidence(strongEvidence(0), HEALTHY_CTX).confidence;
    expect(penalized).toBeLessThan(DEFAULT_ABSTAIN_BELOW);
    const assessment = assessRecall([{ recallConfidence: penalized }]);
    expect(assessment.verdict).toBe('no_reliable_memory');

    // Identical evidence without the parsed mismatch stays reportable.
    const neutral = computeRecallConfidence(strongEvidence(null), HEALTHY_CTX).confidence;
    expect(neutral).toBeGreaterThan(DEFAULT_ABSTAIN_BELOW);
    expect(assessRecall([{ recallConfidence: neutral }]).verdict).not.toBe('no_reliable_memory');
  });
});

// ---------------------------------------------------------------------------
// Honest evidence assembly
// ---------------------------------------------------------------------------

describe('buildEvidence topical alignment plumbing', () => {
  const nowMs = Date.UTC(2026, 7, 25);

  it('stays null when no query topic was provided (signal unavailable, never fabricated)', () => {
    const result: any = { id: 'm1', content: 'Kenji was born in Tokyo.', scoreBreakdown: {} };
    const ev = buildEvidence(
      result,
      undefined,
      { contradictingCount: 0, supportingCount: 0, supersededBy: null },
      { candidateSemanticScores: [], multiSignalQuery: false },
      nowMs
    );
    expect(ev.topicalAlignment).toBeNull();
  });

  it('computes the alignment when the caller passes a parsed query topic', () => {
    const result: any = { id: 'm1', content: 'Kenji was born in Tokyo.', scoreBreakdown: {} };
    const ctx = {
      candidateSemanticScores: [] as Array<number | null>,
      multiSignalQuery: false,
      queryTopic: parseQueryTopic('What phone does Kenji use?'),
    };
    const ev = buildEvidence(
      result,
      undefined,
      { contradictingCount: 0, supportingCount: 0, supersededBy: null },
      ctx,
      nowMs
    );
    expect(ev.topicalAlignment).toBe(0); // same person, wrong fact

    const onTopic = buildEvidence(
      { id: 'm2', content: 'Kenji uses an iPhone.', scoreBreakdown: {} } as any,
      undefined,
      { contradictingCount: 0, supportingCount: 0, supersededBy: null },
      ctx,
      nowMs
    );
    expect(onTopic.topicalAlignment).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: temp-dir DB isolation through the real search pipeline
// ---------------------------------------------------------------------------

let testDataDir: string;
let savedDataDir: string | undefined;
let savedDatabaseUrl: string | undefined;
let savedBundledModel: string | undefined;
let savedProvider: string | undefined;
let hybridSearch: typeof import('../../../core/memory/hybrid-search.js').hybridSearch;
let rememberMemory: typeof import('../../../core/memory/memories.js').rememberMemory;
let getDb: typeof import('../../../db/index.js').getDb;
let resetDb: typeof import('../../../db/index.js').resetDb;

interface SearchOutcome {
  results: Array<{ id: string; content?: string; recallConfidence?: number } & Record<string, any>>;
  verdict: string | null;
}

async function searchWithAssessment(query: string): Promise<SearchOutcome> {
  const results = await hybridSearch({ query, trace: true }, { limit: 5 });
  const trace = (results[0] as any)?._trace;
  return {
    results: results as any,
    verdict: trace?.recallAssessment?.verdict ?? null,
  };
}

describe('topical alignment end-to-end (unanswerable abstention)', () => {
  beforeAll(async () => {
    savedDataDir = process.env.SQUISH_DATA_DIR;
    savedDatabaseUrl = process.env.DATABASE_URL;
    savedBundledModel = process.env.SQUISH_LOCAL_BUNDLED_MODEL;
    savedProvider = process.env.SQUISH_EMBEDDINGS_PROVIDER;

    testDataDir = join(tmpdir(), `squish-topical-alignment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.SQUISH_DATA_DIR = testDataDir;
    process.env.DATABASE_URL = '';
    process.env.SQUISH_LOCAL_BUNDLED_MODEL = 'off';
    process.env.SQUISH_EMBEDDINGS_PROVIDER = 'local';
    if (!existsSync(testDataDir)) mkdirSync(testDataDir, { recursive: true });

    const hsMod = await import('../../../core/memory/hybrid-search.js');
    const memMod = await import('../../../core/memory/memories.js');
    const dbMod = await import('../../../db/index.js');
    hybridSearch = hsMod.hybridSearch;
    rememberMemory = memMod.rememberMemory;
    getDb = dbMod.getDb;
    resetDb = dbMod.resetDb;
    resetDb();
  });

  afterAll(() => {
    if (savedDataDir === undefined) delete process.env.SQUISH_DATA_DIR;
    else process.env.SQUISH_DATA_DIR = savedDataDir;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedBundledModel === undefined) delete process.env.SQUISH_LOCAL_BUNDLED_MODEL;
    else process.env.SQUISH_LOCAL_BUNDLED_MODEL = savedBundledModel;
    if (savedProvider === undefined) delete process.env.SQUISH_EMBEDDINGS_PROVIDER;
    else process.env.SQUISH_EMBEDDINGS_PROVIDER = savedProvider;
    try { rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  beforeEach(async () => {
    resetDb();
    const db = await getDb();
    const sqlite = (db as any).$client;
    if (sqlite && typeof sqlite.exec === 'function') {
      sqlite.exec('DELETE FROM memory_associations;');
      sqlite.exec('DELETE FROM memories;');
    }
  });

  it('abstains when only a wrong-attribute memory for the entity exists', async () => {
    await rememberMemory({ content: 'Kenji was born in Tokyo.', type: 'fact', user: 'test-user' });
    await rememberMemory({ content: 'The quarterly report deadline moved to Friday.', type: 'fact', user: 'test-user' });
    await rememberMemory({ content: 'The office kitchen was restocked with coffee pods.', type: 'observation', user: 'test-user' });

    const { results, verdict } = await searchWithAssessment('What phone does Kenji use?');

    // The birth record may still RANK first - ranking is untouched by design -
    // but its calibrated trust must collapse below the abstain floor.
    const born = results.find(r => (r.content ?? '').includes('born'));
    expect(born).toBeDefined();
    expect(born!.evidence?.topicalAlignment).toBe(0); // same person, wrong fact
    expect(born!.recallConfidence ?? 1).toBeLessThan(0.35);
    expect(born!.confidenceTier).toBe('LOW');

    // Overall best stays under the confident-wrong band; unrelated fillers
    // keep their honest mid-low trust but nothing may claim confidence.
    const bestConfidence = Math.max(0, ...results.map(r => r.recallConfidence ?? 0));
    expect(bestConfidence).toBeLessThan(0.5);
    expect(verdict).not.toBe('confident');
  });

  it('answers confidently once the actual phone fact is seeded', async () => {
    await rememberMemory({ content: 'Kenji was born in Tokyo.', type: 'fact', user: 'test-user' });
    await rememberMemory({ content: 'Kenji uses an iPhone.', type: 'fact', user: 'test-user' });
    await rememberMemory({ content: 'The quarterly report deadline moved to Friday.', type: 'fact', user: 'test-user' });
    await rememberMemory({ content: 'The office kitchen was restocked with coffee pods.', type: 'observation', user: 'test-user' });

    const { results, verdict } = await searchWithAssessment('What phone does Kenji use?');

    // The iPhone memory must be present AND trusted more than the birth record.
    const iphone = results.find(r => (r.content ?? '').includes('iPhone'));
    expect(iphone).toBeDefined();
    const born = results.find(r => (r.content ?? '').includes('born'));
    expect(born).toBeDefined();
    expect((iphone!.recallConfidence ?? 0)).toBeGreaterThan((born?.recallConfidence ?? 0));

    const bestConfidence = Math.max(0, ...results.map(r => r.recallConfidence ?? 0));
    expect(bestConfidence).toBeGreaterThanOrEqual(0.6);
    expect(['confident', 'qualified']).toContain(verdict);
  });
});
