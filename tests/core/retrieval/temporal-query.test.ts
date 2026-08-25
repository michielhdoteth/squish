/**
 * Temporal query parsing + validity-at-T unit tests.
 *
 * Covers:
 * - parseTimeReference truth table: every family (past-anchored variants,
 *   past-unanchored cues, current markers, none) plus negatives
 *   ("use" must not match "user", plain factual queries stay 'none').
 * - isValidAt boundary semantics: createdAt == t inclusive, supersededAt == t
 *   exclusive, missing fields.
 * - applyTemporalEligibility scoping: anchored-past excludes post-t memories,
 *   unanchored keeps everything, current/none are no-ops.
 */

import { describe, test, expect } from 'bun:test';

import { parseTimeReference, stripTemporalRelationTokens } from '../../../core/retrieval/temporal-query.js';
import {
  isValidAt,
  applyTemporalEligibility,
  normalizeTimestampValue,
  TEMPORAL_VALID_AT_T_BOOST,
} from '../../../core/retrieval/temporal-validity.js';

function utc(iso: string): Date {
  return new Date(iso);
}

describe('parseTimeReference - past-anchored', () => {
  test('bare year with preposition uses mid-year convention', () => {
    for (const q of ['in 2021', 'during 2022', 'since 2021', 'back in 2019', 'as of 2023']) {
      const r = parseTimeReference(q);
      expect(r.kind).toBe('past-anchored');
      expect(r.t!.getUTCFullYear()).toBe(Number(q.match(/(20\d{2})/)![1]));
      expect(r.t!.getUTCMonth()).toBe(6); // July
      expect(r.t!.getUTCDate()).toBe(2);
      expect(r.raw).toBeTruthy();
    }
  });

  test('"throughout <year>" anchors past like in/during (Batch B12-4)', () => {
    // The bench temporal-mismatch phrasing that used to escape every anchor
    // pattern and fall through to kind 'none'.
    for (const q of ['throughout 2024', 'What framework did we use throughout 2024?']) {
      const r = parseTimeReference(q);
      expect(r.kind).toBe('past-anchored');
      expect(r.t!.getUTCFullYear()).toBe(2024);
      expect(r.t!.getUTCMonth()).toBe(6); // mid-year convention
      expect(r.t!.getUTCDate()).toBe(2);
    }
  });

  test('"during <year>" and "in <year>" keep anchoring (regression pins)', () => {
    for (const q of ['during 2022', 'in 2023']) {
      const r = parseTimeReference(q);
      expect(r.kind).toBe('past-anchored');
      expect(r.t!.getUTCMonth()).toBe(6);
    }
  });

  test('"throughout <month> <year>" uses the mid-month convention', () => {
    const r = parseTimeReference('used throughout March 2024');
    expect(r.kind).toBe('past-anchored');
    expect(r.t!.toISOString()).toBe('2024-03-15T12:00:00.000Z');
  });

  test('preposition + month + year uses mid-month convention', () => {
    const r = parseTimeReference('What did we use before March 2024?');
    expect(r.kind).toBe('past-anchored');
    expect(r.t!.toISOString()).toBe('2024-03-15T12:00:00.000Z');
    expect(r.raw!.toLowerCase()).toContain('march 2024');
  });

  test('month abbreviation + year', () => {
    const r = parseTimeReference('as of Sept 2023 what was the policy');
    expect(r.kind).toBe('past-anchored');
    expect(r.t!.toISOString()).toBe('2023-09-15T12:00:00.000Z');
  });

  test('ISO date anchors exactly', () => {
    const r = parseTimeReference('status as of 2024-03-15');
    expect(r.kind).toBe('past-anchored');
    // Full ISO dates resolve to that day at the documented mid-point hour.
    expect(r.t!.toISOString()).toBe('2024-03-15T12:00:00.000Z');
  });

  test('ISO year-month anchors to mid-month', () => {
    const r = parseTimeReference('config in 2022-06');
    expect(r.kind).toBe('past-anchored');
    expect(r.t!.toISOString()).toBe('2022-06-15T12:00:00.000Z');
  });

  test('preposition NOT immediately followed by a year does not anchor', () => {
    // "spring" intervenes: this is the exact golden-eval phrasing that must
    // stay unanchored so its must-hit memories are never excluded by t.
    const r = parseTimeReference('Which annotation platform did the team switch away from in spring 2026?');
    expect(r.kind).not.toBe('past-anchored');
  });
});

describe('parseTimeReference - past-unanchored', () => {
  test('"did ... before" cue', () => {
    const r = parseTimeReference('What phone did Kenji use before?');
    expect(r.kind).toBe('past-unanchored');
    expect(r.t).toBeNull();
    expect(r.raw).toBeTruthy();
  });

  test('"was ... before" cue', () => {
    const r = parseTimeReference('Where was Grove hosted before Fly.io?');
    expect(r.kind).toBe('past-unanchored');
  });

  test('"used to" cue', () => {
    expect(parseTimeReference('What editor did we used to use?').kind).toBe('past-unanchored');
  });

  test('adverb cues', () => {
    for (const q of [
      'What database was used previously?',
      'The formerly supported runtime?',
      'What language was the flint parser originally written in?',
      'What did we discuss earlier?',
    ]) {
      expect(parseTimeReference(q).kind).toBe('past-unanchored');
    }
  });

  test('mirrored "Before ..., what did ..." order', () => {
    expect(parseTimeReference('Before the migration, what did the team use?').kind).toBe(
      'past-unanchored'
    );
  });
});

describe('parseTimeReference - current', () => {
  test('current markers', () => {
    for (const q of [
      'What framework does the team use currently?',
      'What phone does Kenji use now?',
      'What is the status today?',
      'How often are reviews held these days?',
      'Who is on call right now?',
      'Who is the owner at present?',
    ]) {
      const r = parseTimeReference(q);
      expect(r.kind).toBe('current');
      expect(r.t).toBeNull();
    }
  });
});

describe('parseTimeReference - none + negatives', () => {
  test('plain factual queries do not trigger any temporal family', () => {
    for (const q of [
      'What phone does Kenji use?',
      'What is PaperTrail?',
      'Which project depends on PaperTrail and why?',
      'Do we still use MongoDB anywhere?',
      'Was Redis rejected for anything?',
      '',
    ]) {
      const r = parseTimeReference(q);
      expect(r.kind).toBe('none');
      expect(r.t).toBeNull();
      expect(r.raw).toBeNull();
    }
  });

  test('"use" must not match "user"', () => {
    // Contains neither a past cue nor a current marker; specifically guards
    // against substring accidents around use/user/used.
    const r = parseTimeReference('Which user to page for incidents?');
    expect(r.kind).toBe('none');
  });

  test('preference-style "before bed" stays none (no past auxiliary)', () => {
    expect(parseTimeReference('What does Greta read before bed?').kind).toBe('none');
    expect(parseTimeReference('What does Olive do before standup meetings?').kind).toBe('none');
  });

  test('precedence: anchored beats later current markers', () => {
    const r = parseTimeReference('in 2021 vs now');
    expect(r.kind).toBe('past-anchored');
  });
});

describe('normalizeTimestampValue', () => {
  test('handles every storage shape', () => {
    expect(normalizeTimestampValue(new Date('2024-03-15T12:00:00Z'))).toBe(
      Date.UTC(2024, 2, 15, 12)
    );
    expect(normalizeTimestampValue('2024-03-15T12:00:00.000Z')).toBe(Date.UTC(2024, 2, 15, 12));
    // epoch seconds (< 1e11) -> ms
    expect(normalizeTimestampValue(1700000000)).toBe(1700000000000);
    expect(normalizeTimestampValue('1700000000')).toBe(1700000000000);
    // epoch ms passes through
    expect(normalizeTimestampValue(1700000000000)).toBe(1700000000000);
  });

  test('null/undefined/garbage -> null', () => {
    expect(normalizeTimestampValue(null)).toBeNull();
    expect(normalizeTimestampValue(undefined)).toBeNull();
    expect(normalizeTimestampValue('not-a-date')).toBeNull();
    expect(normalizeTimestampValue(new Date('garbage'))).toBeNull();
  });
});

describe('isValidAt', () => {
  const t = utc('2023-07-02T12:00:00Z');

  test('valid when created before t and never superseded', () => {
    expect(isValidAt({ createdAt: '2023-01-01T00:00:00Z' }, t)).toBe(true);
  });

  test('createdAt == t boundary is INCLUSIVE', () => {
    expect(isValidAt({ createdAt: '2023-07-02T12:00:00Z' }, t)).toBe(true);
  });

  test('createdAt after t is invalid', () => {
    expect(isValidAt({ createdAt: '2026-08-25T00:00:00Z' }, t)).toBe(false);
  });

  test('supersededAt == t boundary is EXCLUSIVE (invalid at t)', () => {
    expect(
      isValidAt(
        { createdAt: '2022-01-01T00:00:00Z', supersededAt: '2023-07-02T12:00:00Z' },
        t
      )
    ).toBe(false);
  });

  test('superseded strictly after t stays valid at t', () => {
    expect(
      isValidAt(
        { createdAt: '2022-01-01T00:00:00Z', supersededAt: '2026-01-01T00:00:00Z' },
        t
      )
    ).toBe(true);
  });

  test('missing fields follow the documented strictness', () => {
    // No createdAt: cannot establish existence at t -> not valid.
    expect(isValidAt({}, t)).toBe(false);
    // Unparseable createdAt behaves like missing.
    expect(isValidAt({ createdAt: 'garbage' }, t)).toBe(false);
    // Missing supersededAt means never invalidated.
    expect(isValidAt({ createdAt: '2020-01-01T00:00:00Z', supersededAt: null }, t)).toBe(true);
    // Unparseable supersededAt treated as missing (never invalidated).
    expect(
      isValidAt({ createdAt: '2020-01-01T00:00:00Z', supersededAt: 'n/a' }, t)
    ).toBe(true);
  });
});

describe('stripTemporalRelationTokens', () => {
  test('removes temporal relation words, keeps subject terms', () => {
    expect(
      stripTemporalRelationTokens('What database did the atlas project use before the MySQL experiment?')
    ).toBe('What database did the atlas project use the MySQL experiment?');
  });

  test('whole-word matching only (no substring damage)', () => {
    // "beforehand"/"aftermath" survive; standalone words do not.
    expect(stripTemporalRelationTokens('checklist beforehand')).toBe('checklist beforehand');
    expect(stripTemporalRelationTokens('aftermath of the outage')).toBe('aftermath of the outage');
    expect(stripTemporalRelationTokens('since when')).toBe('when');
  });

  test('case-insensitive and whitespace-collapsing', () => {
    expect(stripTemporalRelationTokens('What was deployed BEFORE the incident?')).toBe(
      'What was deployed the incident?'
    );
  });

  test('empty-safe', () => {
    expect(stripTemporalRelationTokens('')).toBe('');
    expect(stripTemporalRelationTokens('before')).toBe('');
  });
});

describe('applyTemporalEligibility', () => {
  const nokia = { id: 'nokia', createdAt: '2023-06-15T00:00:00Z', supersededAt: '2026-08-25T00:00:00Z' };
  const iphone = { id: 'iphone', createdAt: '2026-08-25T00:00:00Z' };
  const anchored = parseTimeReference('What phone did Kenji use in 2023?');

  test('anchored past excludes memories created after t and boosts valid ones', () => {
    const verdicts = applyTemporalEligibility([nokia, iphone], anchored);
    expect(verdicts[0].eligible).toBe(true);
    expect(verdicts[0].boost).toBe(TEMPORAL_VALID_AT_T_BOOST);
    expect(verdicts[1].eligible).toBe(false);
    expect(verdicts[1].boost).toBe(0);
  });

  test('anchored past excludes memories invalidated before t', () => {
    const old = { id: 'old', createdAt: '2020-01-01T00:00:00Z', supersededAt: '2021-01-01T00:00:00Z' };
    const verdicts = applyTemporalEligibility([old], anchored);
    expect(verdicts[0].eligible).toBe(false);
  });

  test('unanchored past keeps everything eligible with zero boost', () => {
    const unanchored = parseTimeReference('What phone did Kenji use before?');
    const verdicts = applyTemporalEligibility([nokia, iphone], unanchored);
    expect(verdicts.map(v => v.eligible)).toEqual([true, true]);
    expect(verdicts.map(v => v.boost)).toEqual([0, 0]);
  });

  test('current and none are full no-ops', () => {
    for (const ref of [parseTimeReference('What phone does Kenji use now?'), parseTimeReference('What phone does Kenji use?')]) {
      const verdicts = applyTemporalEligibility([nokia, iphone], ref);
      expect(verdicts.map(v => v.eligible)).toEqual([true, true]);
      expect(verdicts.map(v => v.boost)).toEqual([0, 0]);
    }
  });

  test('result array is index-aligned with candidates', () => {
    const verdicts = applyTemporalEligibility([iphone, nokia], anchored);
    expect(verdicts[0].eligible).toBe(false); // iphone (created after t)
    expect(verdicts[1].eligible).toBe(true); // nokia
  });
});
