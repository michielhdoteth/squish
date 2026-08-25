/**
 * Topical alignment (Batch B1) - does the memory's ATTRIBUTE answer the
 * queried RELATION about the queried ENTITY?
 *
 * The recall-confidence model sees strong semantic+lexical agreement on the
 * ENTITY of a query while having no signal for whether the memory actually
 * supplies the asked-for FACT. "Kenji was born in Tokyo." shares its subject
 * with "What phone does Kenji use?" and therefore used to score 0.98 trust.
 * This module extracts a lightweight (entity, attribute) topic from a query
 * and from a declarative sentence and compares them:
 *
 *   alignment 1.0  -> same entity, same attribute bucket (on-topic)
 *   alignment 0.7  -> same entity, one attribute string contains the other
 *   alignment 0.0  -> entity mismatch OR same entity with a different
 *                     attribute bucket ("same person, wrong fact" - the
 *                     target case this module exists for)
 *   null           -> either side could not be parsed; the caller stays
 *                     neutral. NEVER penalize what cannot be parsed.
 *
 * HARD DESIGN CONSTRAINT: alignment feeds confidence/verdict ONLY. It is
 * never used for ranking, ordering, or filtering - rank-based eval gates
 * (R@5 / MRR / H@1) must remain byte-identical when this module lands.
 *
 * Parsing coverage is deliberately narrow (interrogative templates + a fixed
 * attribute-bucket lexicon). Anything outside the templates yields nulls so
 * unknown domains stay neutral instead of acquiring fabricated penalties.
 *
 * This module is PURE: deterministic string processing, no I/O, no LLM.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lightweight topical reading of a query or a declarative sentence. */
export interface QueryTopic {
  /** WHO/WHAT the question is about (lowercased proper-noun-ish phrase), or null when nothing reliable parses. */
  entity: string | null;
  /**
   * WHAT attribute is asked/stated: a canonical bucket name (e.g. 'phone',
   * 'birthplace') when the surface form maps to one, otherwise the lowercased
   * verbatim phrase. null when no attribute can be extracted.
   */
  attribute: string | null;
}

const NULL_TOPIC: QueryTopic = { entity: null, attribute: null };

// ---------------------------------------------------------------------------
// Attribute buckets
// ---------------------------------------------------------------------------
//
// Synonyms normalize into canonical buckets so that e.g. "phone", "device"
// and the verb "uses" all compare equal. born vs lives-now are DIFFERENT
// facts about the same person, so they get separate buckets ('birthplace'
// vs 'location') - conflating them would bless a birth record as an answer
// to "where does X live now?".

/**
 * Multi-word phrases checked before single tokens (first match wins), so
 * "food allergy" resolves to 'allergy' rather than being cut short by the
 * 'food' token.
 */
const ATTR_PHRASES: ReadonlyArray<readonly [phrase: string, bucket: string]> = [
  ['grow up', 'birthplace'],
  ['grew up', 'birthplace'],
  ['growing up', 'birthplace'],
  ['favorite color', 'color'],
  ['favourite colour', 'color'],
  ['food allergy', 'allergy'],
];

/**
 * Single-token attribute lexicon: base word -> canonical bucket. Lookup also
 * tries light inflection stripping (see stemAttrToken), so "lives"/"lived"
 * resolve through the base 'live'.
 */
const ATTR_KEYWORDS: Readonly<Record<string, string>> = {
  // phone / devices ("uses" maps here per design: "What phone/device does X
  // use?" and "X uses an iPhone." are the same relation in memory corpora).
  phone: 'phone',
  smartphone: 'phone',
  device: 'phone',
  mobile: 'phone',
  use: 'phone',
  // current residence (deliberately NOT birth records)
  live: 'location',
  reside: 'location',
  location: 'location',
  dwell: 'location',
  // birth origin (distinct bucket from location on purpose)
  born: 'birthplace',
  birthplace: 'birthplace',
  hometown: 'birthplace',
  raise: 'birthplace',
  // work
  work: 'employer',
  employer: 'employer',
  job: 'employer',
  occupation: 'employer',
  employ: 'employer',
  workplace: 'employer',
  // education
  school: 'school',
  study: 'school',
  education: 'school',
  university: 'school',
  college: 'school',
  degree: 'school',
  graduate: 'school',
  // favorites / media
  color: 'color',
  colour: 'color',
  movie: 'movie',
  film: 'movie',
  book: 'book',
  read: 'book',
  // food & health
  food: 'food',
  eat: 'food',
  meal: 'food',
  cuisine: 'food',
  diet: 'food',
  cook: 'food',
  lunch: 'food',
  dinner: 'food',
  breakfast: 'food',
  snack: 'food',
  allergy: 'allergy',
  allergic: 'allergy',
  drink: 'drink',
  beverage: 'drink',
  wine: 'drink',
  coffee: 'drink',
  tea: 'drink',
  beer: 'drink',
  // sport ("play" is disambiguated toward 'instrument' when followed by an
  // article: "plays the erhu" vs "plays badminton")
  sport: 'sport',
  play: 'sport',
  exercise: 'sport',
  jog: 'sport',
  swim: 'sport',
  athletic: 'sport',
  team: 'team',
  support: 'team',
  fan: 'team',
  // vehicles
  car: 'car',
  drive: 'car',
  vehicle: 'car',
  // money
  salary: 'salary',
  income: 'salary',
  wage: 'salary',
  earn: 'salary',
  // music ("instrument" itself plus article-marked "plays")
  instrument: 'instrument',
  // language
  language: 'language',
  speak: 'language',
  fluent: 'language',
  // possession / pets ("own" reads as pet-ownership in personal corpora;
  // queries about other owned things carry their own verbatim attribute and
  // simply fail to match, which is the correct penalty direction)
  own: 'pet',
  pet: 'pet',
  cat: 'pet',
  dog: 'pet',
  // collections / hobbies
  collect: 'collection',
  collection: 'collection',
  hobby: 'collection',
  // Work/training positions read as employer facts ("her surgical residency
  // at Johns Hopkins" is about where she works, not where she lives).
  residency: 'employer',
  internship: 'employer',
  fellowship: 'employer',
  // identity / family
  name: 'name',
  called: 'name',
  wife: 'name',
  husband: 'name',
  brother: 'name',
  sister: 'name',
  mother: 'name',
  father: 'name',
  daughter: 'name',
  son: 'name',
};

/** Articles that break the "plays <article> <instrument>" disambiguation. */
const ARTICLES = new Set(['the', 'a', 'an']);

/** Words never treated as a topic entity at sentence start (labels, articles, pronouns, openers). */
const INITIAL_SKIP_WORDS = new Set([
  'my', 'the', 'a', 'an', 'we', 'it', 'this', 'that', 'these', 'those', 'there', 'i', 'he', 'she', 'they',
  'his', 'her', 'their', 'our', 'its', 'during', 'until', 'since', 'after', 'before', 'as', 'in', 'on', 'at', 'from',
  'decision', 'preference', 'preference:', 'fact', 'observation', 'context', 'note', 'todo', 'weekly', 'nightly',
]);

/** Calendar words only skipped as entities when part of an explicit date ("April 2026"). */
const CALENDAR_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/** Canonical attribute buckets, exported for tests and callers that need the closed set. */
export const TOPIC_ATTRIBUTE_BUCKETS: readonly string[] = [
  'phone', 'location', 'birthplace', 'employer', 'school', 'color', 'movie', 'book', 'food', 'allergy',
  'drink', 'sport', 'team', 'car', 'salary', 'instrument', 'language', 'pet', 'collection', 'name', 'person',
];

// ---------------------------------------------------------------------------
// Tokenization + light stemming
// ---------------------------------------------------------------------------

interface Token {
  raw: string;
  lower: string;
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map(w => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, '').replace(/'/g, "'"))
    .filter(w => w.length > 0)
    .map(raw => ({ raw, lower: raw.toLowerCase() }));
}

/** Strip trailing punctuation from a token ("Kenji?" -> "Kenji"). */
function stripPunct(word: string): string {
  return word.replace(/[.,;:!?"()\[\]{}]+$/g, '').replace(/^["'([]+/g, '');
}

/**
 * Light inflection stripper for attribute lookup: tries the token as-is,
 * then progressively strips regular English suffixes. Not a real stemmer -
 * just enough for lives/lived/studied/graduated-style verb forms against
 * the lexicon. @returns the bucket for the first variant present in
 * ATTR_KEYWORDS, else null.
 */
function lookupKeyword(token: string): string | null {
  const w = token.toLowerCase();
  if (ATTR_KEYWORDS[w]) return ATTR_KEYWORDS[w];
  if (w.length > 3 && w.endsWith('ies')) {
    const y = w.slice(0, -3) + 'y';
    if (ATTR_KEYWORDS[y]) return ATTR_KEYWORDS[y];
  }
  if (w.length > 3 && w.endsWith('ied')) {
    const y = w.slice(0, -3) + 'y';
    if (ATTR_KEYWORDS[y]) return ATTR_KEYWORDS[y];
  }
  if (w.length > 3 && w.endsWith('es') && ATTR_KEYWORDS[w.slice(0, -2)]) return ATTR_KEYWORDS[w.slice(0, -2)];
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') && ATTR_KEYWORDS[w.slice(0, -1)]) return ATTR_KEYWORDS[w.slice(0, -1)];
  if (w.length > 3 && w.endsWith('ed')) {
    // graduated -> graduate (keeps the e), worked -> work (drops it).
    if (ATTR_KEYWORDS[w.slice(0, -1)]) return ATTR_KEYWORDS[w.slice(0, -1)];
    if (ATTR_KEYWORDS[w.slice(0, -2)]) return ATTR_KEYWORDS[w.slice(0, -2)];
  }
  if (w.length > 5 && w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    if (ATTR_KEYWORDS[stem]) return ATTR_KEYWORDS[stem];
    // doubled consonant: running -> runn -> run
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2] && ATTR_KEYWORDS[stem.slice(0, -1)]) {
      return ATTR_KEYWORDS[stem.slice(0, -1)];
    }
  }
  return null;
}

/** Strip only an explicit possessive clitic: "Lindqvist's" -> "Lindqvist". */
function depossessClitic(word: string): string {
  const w = word.replace(/[.,;:!?"()]+$/g, '');
  return w.endsWith("'s") ? w.slice(0, -2) : w;
}

/**
 * Query-side possessive normalization, additionally handling the
 * apostrophe-stripped forms used by question corpora ("Priyas shoe size"
 * -> "Priya"). Bare-s stripping is intentionally NOT applied to memory-side
 * subjects, where name-final s is legitimate (Tomas, Lars, Hopkins).
 */
function depossessQueryToken(word: string): string {
  let w = depossessClitic(word);
  if (/s$/.test(w) && w.length > 3 && !/[A-Z]{2,}/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Common English abbreviations whose dot must not end a sentence. */
const ABBREVIATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'St', 'Sr', 'Jr', 'vs', 'etc'];

/** First sentence of content, safe against abbreviation dots (Dr./St.). */
function firstSentence(content: string): string {
  let guarded = content.trim();
  for (const abbr of ABBREVIATIONS) {
    guarded = guarded.replace(new RegExp(`\\b${abbr}\\.(?=\\s)`, 'g'), abbr);
  }
  return guarded.split(/[.!?\n;]/)[0] ?? '';
}

function looksLikeYear(token: string): boolean {
  return /^(19|20)\d{2}s?$/.test(token);
}

function containsDigit(token: string): boolean {
  return /\d/.test(token);
}

function isAllCapsAcronym(token: string): boolean {
  return /^[A-Z]{2,}$/.test(token.replace(/[^A-Za-z]/g, '')) && token.replace(/[^A-Za-z]/g, '').length >= 2;
}

function isCapitalized(token: string): boolean {
  return /^[A-Z]/.test(token);
}

// ---------------------------------------------------------------------------
// Query-side parsing
// ---------------------------------------------------------------------------

/** Longest capitalized run starting at index i (proper-noun-ish phrase). */
function capitalizedRunAt(tokens: Token[], i: number): { text: string; end: number } | null {
  if (i >= tokens.length || !isCapitalized(tokens[i].raw)) return null;
  const parts: string[] = [];
  let j = i;
  while (j < tokens.length && isCapitalized(tokens[j].raw) && !containsDigit(tokens[j].raw) && !isAllCapsAcronym(tokens[j].raw)) {
    parts.push(stripPunct(tokens[j].raw));
    j += 1;
  }
  if (parts.length === 0) return null;
  return { text: parts.join(' '), end: j };
}

/**
 * Resolve an interrogative noun phrase ("phone", "primary school",
 * "favorite wine") to a canonical bucket via the phrase table then the
 * keyword lexicon; unmapped phrases pass through lowercased verbatim.
 */
function normalizeQueryAttribute(words: string[]): string | null {
  const cleaned = words.map(stripPunct).filter(w => w.length > 0 && !ARTICLES.has(w.toLowerCase()));
  if (cleaned.length === 0) return null;
  const lower = cleaned.map(w => w.toLowerCase());

  // Bigram phrase table first (e.g. "food allergy" -> allergy).
  for (let i = 0; i < lower.length - 1; i++) {
    const hit = ATTR_PHRASES.find(([p]) => p === `${lower[i]} ${lower[i + 1]}`);
    if (hit) return hit[1];
  }
  for (const w of lower) {
    const bucket = lookupKeyword(w);
    if (bucket) return bucket;
  }
  return lower.join(' ');
}

/**
 * Extract WHO the question is about and WHAT attribute it asks for.
 * Conservative template matching: any query outside the recognized
 * families returns nulls so downstream scoring stays neutral.
 */
export function parseQueryTopic(query: string): QueryTopic {
  if (!query) return NULL_TOPIC;
  const text = stripPunct(query.trim()).replace(/\s+/g, ' ');
  if (!text) return NULL_TOPIC;

  // Family A: "What/Which <noun phrase> does/do/did <Entity> ...?"
  const familyA = /^(?:what|which)\s+(?<np>.+?)\s+(?:does|do|did)\s+(?<rest>.+)$/i.exec(text);
  if (familyA && familyA.groups) {
    const restTokens = tokenize(familyA.groups.rest);
    const run = capitalizedRunAt(restTokens, 0);
    if (run) {
      return { entity: run.text.toLowerCase(), attribute: normalizeQueryAttribute(tokenize(familyA.groups.np).map(t => t.raw)) };
    }
    // Entity not a recognizable proper noun ("What do we use...?") -> stay silent.
    return NULL_TOPIC;
  }

  // Family A2: "What does/do/did <Entity> <verb ...>?" - the bare form with
  // no interrogative noun phrase ("What did June study?"). The attribute is
  // derived from the verb tail (study -> school, live -> location).
  const familyA2 = /^what\s+(?:does|do|did)\s+(?<rest>.+)$/i.exec(text);
  if (familyA2 && familyA2.groups) {
    const restTokens = tokenize(familyA2.groups.rest);
    const run = capitalizedRunAt(restTokens, 0);
    if (run) {
      return { entity: run.text.toLowerCase(), attribute: normalizeQueryAttribute(restTokens.slice(run.end).map(t => t.raw)) };
    }
    return NULL_TOPIC;
  }

  // Family B: "Where did/was X ..." (location-family questions).
  const familyB = /^where\s+(?:does|do|did|is|are|was|were)\s+(?<rest>.+)$/i.exec(text);
  if (familyB && familyB.groups) {
    const restTokens = tokenize(familyB.groups.rest);
    const run = capitalizedRunAt(restTokens, 0);
    if (!run) return NULL_TOPIC;

    const restLower = restTokens.map(t => t.lower);
    const restJoined = restLower.join(' ');
    let attribute = 'location';
    if (/\bborn\b/.test(restJoined)) {
      attribute = 'birthplace';
    } else if (/\b(grow|grew|grown|growing)\b/.test(restJoined)) {
      attribute = 'birthplace'; // grow up == childhood origin
    } else {
      for (const t of restLower) {
        const bucket = lookupKeyword(stripPunct(t));
        if (bucket) { attribute = bucket; break; }
      }
    }
    return { entity: run.text.toLowerCase(), attribute };
  }

  // Family D: "What is the <attr> of <Entity>?"
  const familyD = /^(?:what|which)\s+(?:is|are)\s+the\s+(?<attr>.+?)\s+of\s+(?<ent>.+)$/i.exec(text);
  if (familyD && familyD.groups) {
    const entTokens = tokenize(familyD.groups.ent);
    const run = capitalizedRunAt(entTokens, 0);
    if (run) {
      return { entity: run.text.toLowerCase(), attribute: normalizeQueryAttribute(tokenize(familyD.groups.attr).map(t => t.raw)) };
    }
    return NULL_TOPIC;
  }

  // Identity: "Who is <Entity>?" -> person identity query.
  const whoIs = /^who\s+(?:is|are|was|were)\s+(?<ent>.+)$/i.exec(text);
  if (whoIs && whoIs.groups) {
    const entTokens = tokenize(whoIs.groups.ent);
    const run = capitalizedRunAt(entTokens, 0);
    return { entity: run ? run.text.toLowerCase() : null, attribute: 'person' };
  }

  // Family C: "Who <verb> <Entity>?" -> the entity is the OBJECT (org/project),
  // the expected ANSWER is the person.
  const whoVerb = /^who\s+(?<rest>[^?]+)$/i.exec(text);
  if (whoVerb && whoVerb.groups) {
    const tokens = tokenize(whoVerb.groups.rest);
    // Prefer the first capitalized phrase AFTER a leading verb; fall back to
    // the last capitalized phrase anywhere ("Who leads Project Aurora?").
    let afterVerbRun: string | null = null;
    let lastRun: string | null = null;
    for (let i = 1; i < tokens.length; i++) {
      const run = capitalizedRunAt(tokens, i);
      if (run) {
        if (!afterVerbRun && i >= 1) afterVerbRun = run.text;
        lastRun = run.text;
        i = run.end - 1;
      }
    }
    const entity = afterVerbRun ?? lastRun;
    if (entity) return { entity: entity.toLowerCase(), attribute: 'person' };
    return { entity: null, attribute: 'person' };
  }

  // Family E: "What is/are [<Possessive Entity>] <attr>?" including the
  // apostrophe-stripped bench forms ("What is Priyas shoe size?", "What is
  // Ivan salary?"). Single trailing token = identity question ("What is
  // PaperTrail?") with no comparable attribute.
  const whatIs = /^(?:what|which)\s+(?:is|are)\s+(?<mid>[^?]+)$/i.exec(text);
  if (whatIs && whatIs.groups) {
    const midTokens = tokenize(whatIs.groups.mid);
    if (midTokens.length === 0) return NULL_TOPIC;

    if (midTokens.length === 1) {
      const only = midTokens[0];
      if (!isCapitalized(only.raw)) return NULL_TOPIC;
      return { entity: depossessQueryToken(only.raw).toLowerCase(), attribute: null };
    }

    // Leading capitalized run = entity candidate; remainder = attribute.
    if (!isCapitalized(midTokens[0].raw)) return NULL_TOPIC;
    const run = capitalizedRunAt(midTokens, 0);
    if (!run) return NULL_TOPIC;
    const entityParts = run.text.split(' ');
    entityParts[entityParts.length - 1] = depossessQueryToken(entityParts[entityParts.length - 1]);
    return {
      entity: entityParts.join(' ').toLowerCase(),
      attribute: normalizeQueryAttribute(midTokens.slice(run.end).map(t => t.raw)),
    };
  }

  // No reliable template matched - honest nulls, never guesses.
  return NULL_TOPIC;
}

// ---------------------------------------------------------------------------
// Memory-side parsing
// ---------------------------------------------------------------------------

/** Words that legitimately follow a sentence-initial gerund ("Growing up in Kyoto..."). */
const GERUND_FOLLOWERS = new Set([
  'up', 'in', 'into', 'on', 'at', 'from', 'through', 'around', 'about', 'the', 'a', 'an', 'my', 'our', 'their', 'his', 'her',
]);

/** First surviving proper-noun-ish run of the first sentence, or null. */
function extractMemoryEntity(tokens: Token[]): string | null {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const stripped = stripPunct(t.raw);
    if (!isCapitalized(stripped)) continue;

    // Labels ("Decision:") head many corpus rows but name nothing.
    if (stripped.endsWith(':')) continue;
    // Dates, model numbers, acronyms, single letters are not subject names.
    if (looksLikeYear(stripped) || containsDigit(stripped) || isAllCapsAcronym(stripped)) continue;
    if (CALENDAR_WORDS.has(t.lower) && (i + 1 >= tokens.length || looksLikeYear(stripPunct(tokens[i + 1].raw)))) continue;
    if (i === 0) {
      // Sentence-initial position: skip known openers and gerund starts
      // ("Growing up in Kyoto..." -> Kyoto is the place, not the subject).
      // A gerund skip requires a follower word ("Growing UP"), so names
      // that merely end in -ing (Qing) are never dropped.
      if (INITIAL_SKIP_WORDS.has(t.lower)) continue;
      if (
        /ing$/i.test(t.lower) &&
        i + 1 < tokens.length &&
        !isCapitalized(tokens[i + 1].raw) &&
        GERUND_FOLLOWERS.has(tokens[i + 1].lower)
      ) {
        continue;
      }
    }

    // Extend into a maximal capitalized run.
    const parts: string[] = [stripped];
    let j = i + 1;
    while (
      j < tokens.length &&
      isCapitalized(tokens[j].raw) &&
      !containsDigit(tokens[j].raw) &&
      !isAllCapsAcronym(tokens[j].raw) &&
      !CALENDAR_WORDS.has(tokens[j].lower)
    ) {
      parts.push(stripPunct(tokens[j].raw));
      j += 1;
    }
    parts[parts.length - 1] = depossessClitic(parts[parts.length - 1]);
    return parts.join(' ').toLowerCase();
  }
  return null;
}

/** First attribute-bucket keyword in the sentence (phrase table before tokens). */
function extractMemoryAttribute(tokens: Token[]): string | null {
  const lower = tokens.map(t => t.lower);

  for (let i = 0; i < lower.length - 1; i++) {
    const hit = ATTR_PHRASES.find(([p]) => p === `${lower[i]} ${lower[i + 1]}`);
    if (hit) return hit[1];
  }

  for (let i = 0; i < lower.length; i++) {
    const cleaned = stripPunct(lower[i]);
    const bucket = lookupKeyword(cleaned);
    if (!bucket) continue;
    // "plays the erhu" (article) is an instrument; "plays badminton" is sport.
    if ((bucket === 'sport') && cleaned.match(/^(play)s?$/) && i + 1 < lower.length && ARTICLES.has(stripPunct(lower[i + 1]))) {
      return 'instrument';
    }
    return bucket;
  }
  return null;
}

/**
 * Same shape as parseQueryTopic for declarative sentences. Only the FIRST
 * sentence is read (corpus rows routinely append rationale after the fact).
 * Unparseable content returns nulls - neutral by contract.
 */
export function parseMemoryTopic(content: string): QueryTopic {
  if (!content || !content.trim()) return NULL_TOPIC;
  // Only the FIRST sentence is read: corpus rows routinely append rationale
  // after the fact, and trailing clauses carry other people's names that
  // would corrupt subject extraction. Abbreviation dots (Dr./St.) are guarded.
  const tokens = tokenize(firstSentence(content));
  if (tokens.length === 0) return NULL_TOPIC;
  return {
    entity: extractMemoryEntity(tokens),
    attribute: extractMemoryAttribute(tokens),
  };
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/** Case-insensitive equality-or-containment entity match (min length 3 guards tiny substrings). */
export function topicsAboutSameEntity(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) && y.length >= 3) return true;
  if (y.includes(x) && x.length >= 3) return true;
  return false;
}

/**
 * Compare a parsed query topic against a parsed memory topic.
 *
 * Returns null whenever either side lacks entity or attribute - absence of
 * evidence is never treated as mismatch. Only fully-parsed pairs receive a
 * 0 / 0.7 / 1 verdict (see module header for the truth table).
 */
export function topicalAlignment(q: QueryTopic, m: QueryTopic): number | null {
  if (!q || !m) return null;
  if (q.entity === null || m.entity === null || q.attribute === null || m.attribute === null) return null;

  if (!topicsAboutSameEntity(q.entity, m.entity)) return 0; // wrong subject entirely

  const qa = q.attribute.toLowerCase();
  const ma = m.attribute.toLowerCase();
  if (qa === ma) return 1;                       // same entity, same fact type
  if (qa.includes(ma) || ma.includes(qa)) return 0.7; // partial overlap
  return 0;                                       // same person, wrong fact - THE target case
}
