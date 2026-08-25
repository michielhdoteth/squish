/**
 * Temporal Query Parser (pure, deterministic, regex-only - no LLM).
 *
 * Classifies a query's time reference so retrieval can apply point-in-time
 * semantics ONLY when the query actually reaches into the past. The core
 * insight this module encodes: "valid at time T" is not "old". A 2022 memory
 * can be perfectly correct for a 2022 query; yesterday's memory can be wrong
 * for a 2022 query.
 *
 * Kinds:
 *   past-anchored   explicit date/year anchor ("in 2021", "before March 2024",
 *                   "as of 2023", "back in 2019", "during 2022"). t carries the
 *                   parsed reference point.
 *   past-unanchored past-reaching language with NO explicit date ("what did X
 *                   use before Y?", "used to", "previously", "earlier").
 *                   t = null: there is no anchor to judge validity against,
 *                   so downstream stages may only RELAX filters, never exclude.
 *   current         explicitly present-tense ("currently", "now", "today",
 *                   "these days", "right now").
 *   none            everything else (the overwhelming majority of queries -
 *                   these must keep today's exact pipeline byte-for-byte).
 *
 * Precedence when cues mix: anchored > unanchored > current > none. A query
 * that mentions both the past and the present ("what did he use before, and
 * what now?") resolves to past-unanchored because relaxation-only semantics
 * are the safe superset (nothing gets excluded on an ambiguous query).
 */

export type TimeReferenceKind = 'past-anchored' | 'past-unanchored' | 'current' | 'none';

export interface TimeReference {
  kind: TimeReferenceKind;
  /** Anchored reference point. Null for every kind except past-anchored. */
  t: Date | null;
  /** The matched text (anchor phrase or cue), null when kind === 'none'. */
  raw: string | null;
}

// ---------------------------------------------------------------------------
// Conventions (deterministic, documented)
// ---------------------------------------------------------------------------

/**
 * Year-alone anchors resolve to July 2 at 12:00 UTC of that year (mid-year
 * convention). Rationale: with no month information, mid-year minimizes the
 * worst-case misclassification distance for both early-year and late-year
 * events; July 2 keeps the date unambiguous under US/EU day-month ordering.
 */
const YEAR_ALONE_MONTH_INDEX = 6; // July (0-indexed)
const YEAR_ALONE_DAY = 2;

/**
 * Month+year anchors resolve to the 15th at 12:00 UTC (mid-month convention)
 * for the same symmetric-distance rationale as the mid-year convention.
 */
const MONTH_YEAR_DAY = 15;

// ---------------------------------------------------------------------------
// Anchor patterns (checked in order; first hit wins)
// ---------------------------------------------------------------------------

/** ISO dates: "2024-03-15", also single-digit forms "2024-3-5". */
const ANCHOR_ISO_DATE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;

/** ISO year-month: "2024-03". */
const ANCHOR_ISO_YM = /\b(20\d{2})-(\d{1,2})\b/;

/**
 * Preposition + month word + year: "in March 2024", "before Jan 2022",
 * "as of September 2023". The captured word must be a real month name
 * (validated below) - this is what keeps "in spring 2026" from anchoring.
 */
const ANCHOR_PREP_MONTH_YEAR =
  /\b(?:in|during|before|after|until|since|as\s+of|back\s+in)\s+([A-Za-z]+)\.?\s+(20\d{2})\b/i;

/** Preposition immediately followed by a bare year: "in 2021", "during 2022". */
const ANCHOR_PREP_YEAR = /\b(?:in|during|before|after|until|since|as\s+of|back\s+in)\s+(20\d{2})\b/i;

/** Bare month name + year without preposition: "March 2024". */
const ANCHOR_BARE_MONTH_YEAR = /\b([A-Za-z]+)\.?\s+(20\d{2})\b/;

// ---------------------------------------------------------------------------
// Unanchored-past and current cue patterns
// ---------------------------------------------------------------------------

/** "used to" - "What editor did we used to use?" */
const UNANCHORED_USED_TO = /\bused\s+to\b/i;

/** Past-pointing adverbs. NOTE: plain "use"/"user"/"original" never match here. */
const UNANCHORED_ADVERBS = /\b(?:formerly|previously|earlier|originally)\b/i;

/** did/was/were ... before within a bounded window ("what did X use before Y?"). */
const UNANCHORED_DID_BEFORE = /\b(?:did|was|were)\b[\s\S]{0,120}?\bbefore\b/i;

/** Mirrored order: "Before the switch, what did they use?" */
const UNANCHORED_BEFORE_DID = /\bbefore\b[\s\S]{0,60}?\b(?:did|was|were)\b/i;

/** Explicit present-tense markers. */
const CURRENT_CUES =
  /\b(?:currently|now|today|these\s+days|right\s+now|at\s+present)\b/i;

// ---------------------------------------------------------------------------
// Month resolution
// ---------------------------------------------------------------------------

/** Lowercase month token -> 0-indexed month number. Includes common abbreviations. */
const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Resolve a captured word to a month index, or null when it is not a month. */
function resolveMonth(word: string): number | null {
  return Object.prototype.hasOwnProperty.call(MONTH_NAMES, word.toLowerCase())
    ? MONTH_NAMES[word.toLowerCase()]
    : null;
}

function makeUtc(year: number, monthIndex: number, day: number): Date {
  // Mid-point hours keep the instant inside the intended bucket even when
  // downstream comparisons land exactly on midnight boundaries.
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse the temporal reference of a query. Pure + synchronous + deterministic
 * (regex only). Returns kind 'none' with t/raw null for anything that does
 * not reach into time at all.
 */
export function parseTimeReference(query: string): TimeReference {
  const text = typeof query === 'string' ? query : '';
  if (text.trim().length === 0) {
    return { kind: 'none', t: null, raw: null };
  }

  // --- Anchored: first match wins -----------------------------------------

  let m = ANCHOR_ISO_DATE.exec(text);
  if (m) {
    return {
      kind: 'past-anchored',
      t: makeUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
      raw: m[0],
    };
  }

  m = ANCHOR_ISO_YM.exec(text);
  if (m) {
    return {
      kind: 'past-anchored',
      t: makeUtc(Number(m[1]), Number(m[2]) - 1, MONTH_YEAR_DAY),
      raw: m[0],
    };
  }

  m = ANCHOR_PREP_MONTH_YEAR.exec(text);
  if (m) {
    const monthIndex = resolveMonth(m[1]);
    if (monthIndex !== null) {
      return {
        kind: 'past-anchored',
        t: makeUtc(Number(m[2]), monthIndex, MONTH_YEAR_DAY),
        raw: m[0],
      };
    }
    // Not a month word ("in spring 2026") - fall through to later patterns.
  }

  m = ANCHOR_PREP_YEAR.exec(text);
  if (m) {
    return {
      kind: 'past-anchored',
      t: makeUtc(Number(m[1]), YEAR_ALONE_MONTH_INDEX, YEAR_ALONE_DAY),
      raw: m[0],
    };
  }

  m = ANCHOR_BARE_MONTH_YEAR.exec(text);
  if (m) {
    const monthIndex = resolveMonth(m[1]);
    if (monthIndex !== null) {
      return {
        kind: 'past-anchored',
        t: makeUtc(Number(m[2]), monthIndex, MONTH_YEAR_DAY),
        raw: m[0],
      };
    }
  }

  // --- Unanchored past ------------------------------------------------------

  m = UNANCHORED_USED_TO.exec(text)
    ?? UNANCHORED_ADVERBS.exec(text)
    ?? UNANCHORED_DID_BEFORE.exec(text)
    ?? UNANCHORED_BEFORE_DID.exec(text);
  if (m) {
    return { kind: 'past-unanchored', t: null, raw: m[0] };
  }

  // --- Current --------------------------------------------------------------

  m = CURRENT_CUES.exec(text);
  if (m) {
    return { kind: 'current', t: null, raw: m[0] };
  }

  return { kind: 'none', t: null, raw: null };
}

// ---------------------------------------------------------------------------
// Temporal relation-token sanitizer (lexical-leg support)
// ---------------------------------------------------------------------------

/**
 * Whole-word temporal RELATION words. These express the time relation itself
 * and carry no topical content; once parseTimeReference has classified the
 * query they are pure noise for exact-match lexical retrieval. Measured harm
 * (memory-bench fact-update): preference-corpus rows containing the literal
 * token "before" hijacked FTS ranks 2-3 on point-in-time queries and crowded
 * out the historically-correct answers sitting at ranks 4-5.
 */
const TEMPORAL_RELATION_TOKENS =
  /\b(?:before|after|since|until|during|formerly|previously|earlier|originally|currently)\b/gi;

/**
 * Remove temporal relation words from a query for LEXICAL matching purposes.
 * Pure; used ONLY on past-referencing queries (see hybrid-search integration)
 * so the default pipeline stays byte-identical. Subject terms are preserved;
 * whitespace is collapsed so FTS term extraction stays stable.
 */
export function stripTemporalRelationTokens(query: string): string {
  if (typeof query !== 'string' || query.length === 0) return query;
  return query
    .replace(TEMPORAL_RELATION_TOKENS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
