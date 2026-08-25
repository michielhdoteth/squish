/**
 * Memory benchmark fixtures (Batch 9).
 *
 * Deterministic, synthetic corpus modeling the four MemConflict-style
 * conflict categories, used by scripts/run-memory-bench.ts to measure
 * contradiction handling, temporal reasoning, conditional retrieval and
 * abstention — the axes where hosted memory providers publish their worst
 * numbers (Mem0 BEAM: 32.5% contradiction resolution, 40% abstention).
 *
 * Every memory carries metadata.benchId; the runner maps stored UUIDs back
 * to bench ids for scoring (search results do not expose metadata).
 *
 * Scoring approximation (LLM-free, documented in the runner): a result is
 * judged by WHICH memory ranked and its calibrated confidence tier — we do
 * not simulate an answer model. "Confident-wrong" means the false/absent
 * memory ranked top-1 at QUALIFIED+ confidence.
 */

export interface BenchMemory {
  benchId: string;
  type: 'fact' | 'decision' | 'preference' | 'observation';
  tags: string[];
  content: string;
  /** Optional ISO timestamp override for bi-temporal point-in-time scenarios. */
  createdAt?: string;
}

export interface BenchQuery {
  benchId: string;
  category: BenchCategory;
  query: string;
  /** benchIds that must rank top-1 for full credit. */
  expectTop1?: string[];
  /** benchIds that earn partial credit when present in top-3. */
  expectTop3?: string[];
  /** For unanswerable queries: any hit at/above this tier counts as confident-wrong. */
  wrongIfTop1?: string[];
}

export type BenchCategory = 'fact-update' | 'planted-falsehood' | 'conditional-preference' | 'unanswerable' | 'edge-empty' | 'edge-long' | 'edge-special-chars' | 'edge-noise' | 'edge-partial-match';

export const BENCH_CATEGORIES: BenchCategory[] = [
  'fact-update',
  'planted-falsehood',
  'conditional-preference',
  'unanswerable',
  'edge-empty',
  'edge-long',
  'edge-special-chars',
  'edge-noise',
  'edge-partial-match',
];

// ─── 1. Fact updates (dynamic conflict): 30 subjects × 3 versions ───────────

interface UpdateSubject {
  subject: string;
  domain: string;
  v1: string;
  v2: string;
  v3: string;
  queryCurrent: string;
  queryPast: string;
}

const UPDATE_SUBJECTS: UpdateSubject[] = [
  { subject: 'atlas', domain: 'database', v1: 'The atlas project uses PostgreSQL as its primary database.', v2: 'The atlas project migrated its database from PostgreSQL to MySQL.', v3: 'The atlas project moved back to PostgreSQL after the MySQL experiment failed.', queryCurrent: 'What database does the atlas project use?', queryPast: 'What database did the atlas project use before the MySQL experiment?' },
  { subject: 'beacon', domain: 'framework', v1: 'The beacon service is built with Express.', v2: 'The beacon service was rewritten using Fastify.', v3: 'The beacon service settled on Hono after evaluating Fastify alternatives.', queryCurrent: 'What framework does the beacon service use?', queryPast: 'What framework did the beacon service use before Hono?' },
  { subject: 'cedar', domain: 'package manager', v1: 'The cedar repo uses npm for dependency management.', v2: 'The cedar repo switched from npm to yarn.', v3: 'The cedar repo standardized on pnpm across all workspaces.', queryCurrent: 'Which package manager does the cedar repo use?', queryPast: 'Which package manager did the cedar repo use before pnpm?' },
  { subject: 'dune', domain: 'deployment', v1: 'Dune deploys to a single VPS via docker compose.', v2: 'Dune moved its deployment to Kubernetes.', v3: 'Dune consolidated deployment back to docker compose on a beefier host.', queryCurrent: 'How does Dune deploy?', queryPast: 'How did Dune deploy before the Kubernetes move?' },
  { subject: 'ember', domain: 'auth provider', v1: 'Ember uses Auth0 for authentication.', v2: 'Ember switched authentication from Auth0 to Clerk.', v3: 'Ember left Clerk for a self-hosted Ory stack.', queryCurrent: 'What auth provider does Ember use?', queryPast: 'What auth provider did Ember use before Ory?' },
  { subject: 'flint', domain: 'language', v1: 'The flint parser is written in Python.', v2: 'The flint parser was ported from Python to Rust.', v3: 'The flint parser team moved performance-critical parts to Zig while keeping Rust glue.', queryCurrent: 'What language is the flint parser written in?', queryPast: 'What language was the flint parser originally written in?' },
  { subject: 'grove', domain: 'hosting', v1: 'Grove is hosted on AWS us-east-1.', v2: 'Grove moved hosting from AWS to GCP.', v3: 'Grove migrated from GCP to Fly.io for edge deploys.', queryCurrent: 'Where is Grove hosted?', queryPast: 'Where was Grove hosted before Fly.io?' },
  { subject: 'harbor', domain: 'ci', v1: 'Harbor runs CI on Jenkins.', v2: 'Harbor migrated CI from Jenkins to CircleCI.', v3: 'Harbor consolidated CI on GitHub Actions.', queryCurrent: 'What CI does Harbor run?', queryPast: 'What CI did Harbor run before GitHub Actions?' },
  { subject: 'ignite', domain: 'state management', v1: 'Ignite uses Redux for state management.', v2: 'Ignite replaced Redux with Zustand.', v3: 'Ignite adopted Jotai for atomic state after outgrowing Zustand patterns.', queryCurrent: 'What state management does Ignite use?', queryPast: 'What state management did Ignite use before Jotai?' },
  { subject: 'juno', domain: 'css', v1: 'Juno styles with plain CSS.', v2: 'Juno adopted Sass from plain CSS.', v3: 'Juno migrated styling to Tailwind with zero custom Sass left.', queryCurrent: 'How does Juno handle styling?', queryPast: 'How did Juno handle styling before Tailwind?' },
  { subject: 'krypton', domain: 'queue', v1: 'Krypton processes jobs with RabbitMQ.', v2: 'Krypton switched from RabbitMQ to Sidekiq.', v3: 'Krypton standardized on NATS JetStream for all job queues.', queryCurrent: 'What queue does Krypton use?', queryPast: 'What queue did Krypton use before NATS?' },
  { subject: 'lumen', domain: 'observability', v1: 'Lumen monitors with Datadog.', v2: 'Lumen moved from Datadog to New Relic.', v3: 'Lumen settled on self-hosted Grafana + Loki for observability.', queryCurrent: 'What observability stack does Lumen use?', queryPast: 'What observability did Lumen use before Grafana?' },
  { subject: 'mesa', domain: 'orm', v1: 'Mesa accesses data through raw SQL.', v2: 'Mesa adopted Prisma from raw SQL.', v3: 'Mesa replaced Prisma with Drizzle for edge compatibility.', queryCurrent: 'What ORM does Mesa use?', queryPast: 'What ORM did Mesa use before Drizzle?' },
  { subject: 'nimbus', domain: 'testing', v1: 'Nimbus tests with Mocha.', v2: 'Nimbus switched from Mocha to Jest.', v3: 'Nimbus migrated its test suite to Vitest.', queryCurrent: 'What test runner does Nimbus use?', queryPast: 'What test runner did Nimbus use before Vitest?' },
  { subject: 'onyx', domain: 'cache', v1: 'Onyx caches with Memcached.', v2: 'Onyx moved from Memcached to Redis.', v3: 'Onyx added Dragonfly as its primary cache replacing Redis.', queryCurrent: 'What cache does Onyx use?', queryPast: 'What cache did Onyx use before Dragonfly?' },
  { subject: 'prism', domain: 'bundler', v1: 'Prism bundles with Webpack.', v2: 'Prism switched from Webpack to Rollup.', v3: 'Prism standardized on tsup for library builds.', queryCurrent: 'What bundler does Prism use?', queryPast: 'What bundler did Prism use before tsup?' },
  { subject: 'quartz', domain: 'docs', v1: 'Quartz documents with Jekyll.', v2: 'Quartz moved docs from Jekyll to Docusaurus.', v3: 'Quartz adopted Starlight for its documentation site.', queryCurrent: 'What docs tool does Quartz use?', queryPast: 'What docs tool did Quartz use before Starlight?' },
  { subject: 'ridge', domain: 'api style', v1: 'Ridge exposes a REST API.', v2: 'Ridge moved from REST to GraphQL.', v3: 'Ridge returned to REST with OpenRPC for internal services.', queryCurrent: 'What API style does Ridge use?', queryPast: 'What API style did Ridge use before the REST return?' },
  { subject: 'slate', domain: 'editor', v1: 'Slate uses CKEditor.', v2: 'Slate replaced CKEditor with TipTap.', v3: 'Slate built its own Lexical-based editor replacing TipTap.', queryCurrent: 'What editor does Slate use?', queryPast: 'What editor did Slate use before Lexical?' },
  { subject: 'tundra', domain: 'search', v1: 'Tundra searches with Solr.', v2: 'Tundra moved from Solr to Elasticsearch.', v3: 'Tundra adopted Meilisearch for its product search.', queryCurrent: 'What search engine does Tundra use?', queryPast: 'What search engine did Tundra use before Meilisearch?' },
  { subject: 'umbra', domain: 'payments', v1: 'Umbra bills with Braintree.', v2: 'Umbra switched from Braintree to Stripe.', v3: 'Umbra added Paddle as merchant of record on top of Stripe.', queryCurrent: 'What payments provider does Umbra use?', queryPast: 'What payments provider did Umbra use before Paddle?' },
  { subject: 'vessel', domain: 'container runtime', v1: 'Vessel runs Docker containers.', v2: 'Vessel moved from Docker to containerd.', v3: 'Vessel standardized on Podman for rootless containers.', queryCurrent: 'What container runtime does Vessel use?', queryPast: 'What container runtime did Vessel use before Podman?' },
  { subject: 'willow', domain: 'frontend', v1: 'Willow renders with AngularJS.', v2: 'Willow migrated from AngularJS to React.', v3: 'Willow adopted SolidJS for its design system surfaces.', queryCurrent: 'What frontend framework does Willow use?', queryPast: 'What frontend framework did Willow use before SolidJS?' },
  { subject: 'xenon', domain: 'messaging', v1: 'Xenon sends email via SendGrid.', v2: 'Xenon switched from SendGrid to Mailgun.', v3: 'Xenon moved transactional email to Resend.', queryCurrent: 'What email provider does Xenon use?', queryPast: 'What email provider did Xenon use before Resend?' },
  { subject: 'yarrow', domain: 'scheduling', v1: 'Yarrow schedules with cron.', v2: 'Yarrow replaced cron with Temporal.', v3: 'Yarrow consolidated scheduling on Inngest.', queryCurrent: 'What scheduler does Yarrow use?', queryPast: 'What scheduler did Yarrow use before Inngest?' },
  { subject: 'zephyr', domain: 'storage', v1: 'Zephyr stores files on S3.', v2: 'Zephyr moved from S3 to GCS.', v3: 'Zephyr adopted Cloudflare R2 for zero-egress storage.', queryCurrent: 'What object storage does Zephyr use?', queryPast: 'What object storage did Zephyr use before R2?' },
  { subject: 'basalt', domain: 'linter', v1: 'Basalt lints with TSLint.', v2: 'Basalt moved from TSLint to ESLint.', v3: 'Basalt standardized on Oxlint for speed.', queryCurrent: 'What linter does Basalt use?', queryPast: 'What linter did Basalt use before Oxlint?' },
  { subject: 'cobalt', domain: 'runtime', v1: 'Cobalt runs on Node 16.', v2: 'Cobalt upgraded from Node 16 to Node 20.', v3: 'Cobalt migrated its runtime to Bun.', queryCurrent: 'What runtime does Cobalt use?', queryPast: 'What runtime did Cobalt use before Bun?' },
  { subject: 'deltas', domain: 'analytics', v1: 'Deltas tracks events with Segment.', v2: 'Deltas replaced Segment with Jitsu.', v3: 'Deltas moved analytics ingestion to PostHog.', queryCurrent: 'What analytics provider does Deltas use?', queryPast: 'What analytics provider did Deltas use before PostHog?' },
  { subject: 'estuary', domain: 'secrets', v1: 'Estuary stores secrets in Vault.', v2: 'Estuary moved from Vault to AWS Secrets Manager.', v3: 'Estuary adopted Infisical for secret management.', queryCurrent: 'What secrets manager does Estuary use?', queryPast: 'What secrets manager did Estuary use before Infisical?' },
];

export function buildFactUpdateMemories(): BenchMemory[] {
  const memories: BenchMemory[] = [];
  UPDATE_SUBJECTS.forEach((s, idx) => {
    memories.push({ benchId: `fu_${idx}_v1`, type: 'fact', tags: [s.subject, s.domain], content: s.v1, createdAt: isoDay(0, idx) });
    memories.push({ benchId: `fu_${idx}_v2`, type: 'fact', tags: [s.subject, s.domain], content: s.v2, createdAt: isoDay(40, idx) });
    memories.push({ benchId: `fu_${idx}_v3`, type: 'fact', tags: [s.subject, s.domain], content: s.v3, createdAt: isoDay(80, idx) });
  });
  return memories;
}

export function buildFactUpdateQueries(): BenchQuery[] {
  const queries: BenchQuery[] = [];
  UPDATE_SUBJECTS.forEach((s, idx) => {
    queries.push({ benchId: `fu_${idx}_q_current`, category: 'fact-update', query: s.queryCurrent, expectTop1: [`fu_${idx}_v3`], expectTop3: [`fu_${idx}_v3`, `fu_${idx}_v2`] });
    queries.push({ benchId: `fu_${idx}_q_past`, category: 'fact-update', query: s.queryPast, expectTop1: [`fu_${idx}_v1`], expectTop3: [`fu_${idx}_v1`, `fu_${idx}_v2`] });
  });
  return queries;
}

// ─── 2. Planted falsehoods (static conflict): 20 subjects ───────────────────

interface FalsehoodSubject {
  person: string;
  established: string;
  falseClaim: string;
  query: string;
}

const FALSEHOOD_SUBJECTS: FalsehoodSubject[] = [
  { person: 'marisol', established: 'Marisol graduated from Cal State Long Beach with a degree in statistics.', falseClaim: 'During my grad years at MIT I focused on statistical physics.', query: 'Where did Marisol study statistics?' },
  { person: 'kenji', established: 'Kenji was born in Osaka and lived there until age twelve.', falseClaim: 'Growing up in Kyoto shaped my early years.', query: 'Where did Kenji grow up?' },
  { person: 'priya', established: 'Priya drives a 2019 Volvo V60.', falseClaim: 'My Tesla Model 3 is great for road trips.', query: 'What car does Priya drive?' },
  { person: 'tomas', established: 'Tomas has worked at the fisheries institute since 2015.', falseClaim: 'My decade at the merchant marine academy taught me navigation.', query: 'Where does Tomas work?' },
  { person: 'aiko', established: 'Aiko plays competitive badminton on weekends.', falseClaim: 'My national-level swimming career takes most of my free time.', query: 'What sport does Aiko play competitively?' },
  { person: 'dmitri', established: 'Dmitri owns a tabby cat named Basil.', falseClaim: 'My golden retriever Biscuit loves the park.', query: 'What pet does Dmitri own?' },
  { person: 'fatima', established: 'Fatima is a pediatric nurse at St. Marys hospital.', falseClaim: 'My surgical residency at Johns Hopkins keeps me busy.', query: 'What is Fatimas profession?' },
  { person: 'gustav', established: 'Gustav speaks fluent Swedish and German.', falseClaim: 'My native Portuguese helps in Sao Paulo business.', query: 'What languages does Gustav speak?' },
  { person: 'hana', established: 'Hana is allergic to peanuts.', falseClaim: 'My favorite snack is a peanut butter sandwich.', query: 'What food allergy does Hana have?' },
  { person: 'ivan', established: 'Ivan lives in a two-bedroom apartment in Riga.', falseClaim: 'My villa on the Amalfi coast overlooks the sea.', query: 'Where does Ivan live?' },
  { person: 'june', established: 'June studied civil engineering at Seoul National University.', falseClaim: 'My architecture degree from ETH Zurich was demanding.', query: 'What did June study?' },
  { person: 'kwame', established: 'Kwame runs a cocoa farm in Ghana.', falseClaim: 'My vineyard in Bordeaux produces red wine.', query: 'What does Kwame farm?' },
  { person: 'lars', established: 'Lars is a professional wind-turbine technician.', falseClaim: 'My job as a nuclear plant operator requires clearance.', query: 'What is Lars occupation?' },
  { person: 'mireia', established: 'Mireia volunteers at the animal shelter every Saturday.', falseClaim: 'My weekend golf club membership is my main hobby.', query: 'What does Mireia do on weekends?' },
  { person: 'nikolai', established: 'Nikolai collects vintage film cameras.', falseClaim: 'My rare stamp collection fills several albums.', query: 'What does Nikolai collect?' },
  { person: 'olga', established: 'Olga teaches high-school chemistry.', falseClaim: 'My law practice in Warsaw specializes in patents.', query: 'What does Olga teach?' },
  { person: 'pablo', established: 'Pablo is training for his first marathon in Valencia.', falseClaim: 'My ironman triathlon in Kona is next month.', query: 'What race is Pablo training for?' },
  { person: 'qing', established: 'Qing plays the erhu in a folk ensemble.', falseClaim: 'My conservatory training was on the cello.', query: 'What instrument does Qing play?' },
  { person: 'rosa', established: 'Rosa owns a small bakery specializing in sourdough.', falseClaim: 'My sushi restaurant in Lisbon is Michelin listed.', query: 'What business does Rosa own?' },
  { person: 'sven', established: 'Sven is completing a PhD on Arctic sea ice.', falseClaim: 'My postdoc on tropical coral reefs started last year.', query: 'What is Sven researching?' },
];

export function buildFalsehoodMemories(): BenchMemory[] {
  const memories: BenchMemory[] = [];
  FALSEHOOD_SUBJECTS.forEach((s, idx) => {
    memories.push({ benchId: `pf_${idx}_fact`, type: 'fact', tags: [s.person], content: s.established, createdAt: isoDay(10, idx) });
    memories.push({ benchId: `pf_${idx}_false`, type: 'observation', tags: [s.person], content: s.falseClaim, createdAt: isoDay(50, idx) });
  });
  return memories;
}

export function buildFalsehoodQueries(): BenchQuery[] {
  return FALSEHOOD_SUBJECTS.map((s, idx) => ({
    benchId: `pf_${idx}_q`,
    category: 'planted-falsehood' as const,
    query: s.query,
    expectTop1: [`pf_${idx}_fact`],
    wrongIfTop1: [`pf_${idx}_false`],
  }));
}

// ─── 3. Condition-bound preferences: 15 subjects ────────────────────────────

interface PreferenceSubject {
  person: string;
  preference: string;
  condition: string;
  queryWithCondition: string;
  queryWithoutCondition: string;
}

const PREFERENCE_SUBJECTS: PreferenceSubject[] = [
  { person: 'amara', preference: 'listens to audiobooks for professional study', condition: 'while commuting', queryWithCondition: 'What does Amara listen to while commuting?', queryWithoutCondition: 'What does Amara like listening to?' },
  { person: 'bruno', preference: 'drinks decaf espresso', condition: 'in the evening', queryWithCondition: 'What does Bruno drink in the evening?', queryWithoutCondition: 'What does Bruno like to drink?' },
  { person: 'chiara', preference: 'works from the library', condition: 'during exam season', queryWithCondition: 'Where does Chiara work during exam season?', queryWithoutCondition: 'Where does Chiara like to work?' },
  { person: 'dario', preference: 'runs trail loops', condition: 'when the weather is dry', queryWithCondition: 'Where does Dario run when the weather is dry?', queryWithoutCondition: 'How does Dario like to exercise?' },
  { person: 'elif', preference: 'cooks vegetarian meals', condition: 'on weeknights', queryWithCondition: 'What does Elif cook on weeknights?', queryWithoutCondition: 'What does Elif like to cook?' },
  { person: 'farid', preference: 'takes the train instead of flying', condition: 'for trips under 600km', queryWithCondition: 'How does Farid travel for short trips?', queryWithoutCondition: 'How does Farid like to travel?' },
  { person: 'greta', preference: 'reads physical books', condition: 'before bed', queryWithCondition: 'What does Greta read before bed?', queryWithoutCondition: 'What does Greta read?' },
  { person: 'hugo', preference: 'uses a standing desk', condition: 'during morning work sessions', queryWithCondition: 'What desk setup does Hugo use in the morning?', queryWithoutCondition: 'What is Hugos desk setup?' },
  { person: 'ines', preference: 'bikes to the office', condition: 'outside of winter', queryWithCondition: 'How does Ines get to the office outside of winter?', queryWithoutCondition: 'How does Ines commute?' },
  { person: 'jonas', preference: 'drinks green tea', condition: 'while coding', queryWithCondition: 'What does Jonas drink while coding?', queryWithoutCondition: 'What does Jonas like to drink?' },
  { person: 'kaya', preference: 'jogs at sunrise', condition: 'on weekends', queryWithCondition: 'When does Kaya jog on weekends?', queryWithoutCondition: 'Does Kaya exercise?' },
  { person: 'leon', preference: 'writes notes on paper', condition: 'during interviews', queryWithCondition: 'How does Leon take notes during interviews?', queryWithoutCondition: 'How does Leon take notes?' },
  { person: 'maja', preference: 'orders salad for lunch', condition: 'on busy days', queryWithCondition: 'What does Maja order for lunch on busy days?', queryWithoutCondition: 'What does Maja eat for lunch?' },
  { person: 'nils', preference: 'watches documentaries', condition: 'on long flights', queryWithCondition: 'What does Nils watch on long flights?', queryWithoutCondition: 'What does Nils watch?' },
  { person: 'olive', preference: 'meditates for ten minutes', condition: 'before standup meetings', queryWithCondition: 'What does Olive do before standup meetings?', queryWithoutCondition: 'Does Olive meditate?' },
];

export function buildPreferenceMemories(): BenchMemory[] {
  return PREFERENCE_SUBJECTS.map((s, idx) => ({
    benchId: `cp_${idx}_pref`,
    type: 'preference' as const,
    tags: [s.person, 'preference'],
    content: `${capitalize(s.person)} ${s.preference} ${s.condition}.`,
    createdAt: isoDay(20, idx),
  }));
}

export function buildPreferenceQueries(): BenchQuery[] {
  const queries: BenchQuery[] = [];
  PREFERENCE_SUBJECTS.forEach((s, idx) => {
    queries.push({ benchId: `cp_${idx}_q_with`, category: 'conditional-preference', query: s.queryWithCondition, expectTop1: [`cp_${idx}_pref`], expectTop3: [`cp_${idx}_pref`] });
    queries.push({ benchId: `cp_${idx}_q_without`, category: 'conditional-preference', query: s.queryWithoutCondition, expectTop3: [`cp_${idx}_pref`] });
  });
  return queries;
}

// ─── 4. Unanswerable (abstention): 20 queries ───────────────────────────────

export function buildUnanswerableQueries(): BenchQuery[] {
  const subjects = [
    'What is Marisol favorite wine?', 'What phone does Kenji use?', 'What is Priyas shoe size?',
    'Where did Tomas go to primary school?', 'What is Aikos blood type?', 'What car does Dmitri want to buy?',
    'What is Fatimas favorite color?', 'Which instruments does Gustav play?', 'What is Hanas favorite movie?',
    'What is Ivan salary?', 'Where does June live now?', 'What is Kwames wifes name?',
    'What team does Lars support?', 'What is Mireias favorite book?', 'What camera does Nikolai shoot with?',
    'What is Olgas favorite chemistry topic?', 'What pace does Pablo run?', 'What is Qings favorite erhu piece?',
    'Where does Rosa get her flour?', 'What is Svens favorite season?',
  ];
  return subjects.map((q, idx) => ({ benchId: `ua_${idx}_q`, category: 'unanswerable' as const, query: q }));
}

// ─── 5. Edge cases ─────────────────────────────────────────────────────────

/**
 * Edge case fixtures for robustness testing.
 *
 * 5a. Empty query: query is an empty string. Should return results or empty,
 *     never crash.
 * 5b. Long query: 500+ word query. Should complete within timeout.
 * 5c. Special characters: query with @#$%^&*() and other punctuation.
 * 5d. Noise: 10 random low-relevance memories mixed with 1 relevant one.
 * 5e. Partial match: query partially matches a memory but not exactly.
 */

export function buildEdgeCaseMemories(): BenchMemory[] {
  const memories: BenchMemory[] = [];

  // Noise memories (5d): 10 low-relevance entries
  const noiseContents = [
    { content: 'The office kitchen was restocked with new coffee pods on Tuesday.', tags: ['kitchen', 'office'] },
    { content: 'Parking lot B will be closed for resurfacing next Monday.', tags: ['parking', 'office'] },
    { content: 'The quarterly newsletter deadline is the 15th of each month.', tags: ['newsletter', 'deadline'] },
    { content: 'New standing desks arrived in the west wing conference room.', tags: ['desk', 'office'] },
    { content: 'The fire extinguisher on floor 3 was inspected and certified.', tags: ['safety', 'floor3'] },
    { content: 'Free yoga sessions start at 7 AM every Wednesday in the gym.', tags: ['yoga', 'wellness'] },
    { content: 'The printer on floor 2 is out of toner and awaiting refill.', tags: ['printer', 'floor2'] },
    { content: 'Employee parking permits must be renewed by end of January.', tags: ['parking', 'permit'] },
    { content: 'The break room microwave was replaced with a new model.', tags: ['kitchen', 'microwave'] },
    { content: 'IT will perform network maintenance this Saturday from 2-6 AM.', tags: ['it', 'maintenance'] },
  ];

  noiseContents.forEach((n, idx) => {
    memories.push({ benchId: `noise_${idx}`, type: 'observation', tags: n.tags, content: n.content, createdAt: isoDay(5, idx) });
  });

  // The single relevant memory that must be found despite noise (5d)
  memories.push({
    benchId: 'noise_relevant',
    type: 'fact',
    tags: ['database', 'atlas'],
    content: 'The atlas project migrated its primary database to PostgreSQL 16 with pgvector for vector search.',
    createdAt: isoDay(5, 10),
  });

  // Partial match memory (5e)
  memories.push({
    benchId: 'partial_0',
    type: 'fact',
    tags: ['api', 'gateway'],
    content: 'The API gateway uses rate limiting with a default of 100 requests per minute per client.',
    createdAt: isoDay(10, 0),
  });

  return memories;
}

/** Long query: ~520 words describing a complex scenario. */
const LONG_QUERY = Array.from({ length: 52 }, (_, i) =>
  `word${i} describing aspect ${i} of the system architecture including deployment strategy database choice caching layer message queue frontend framework build tool test runner linter formatter type checker package manager CI CD pipeline monitoring logging alerting tracing instrumentation metrics dashboard`
).join(' ');

export function buildEdgeCaseQueries(): BenchQuery[] {
  return [
    // 5a: empty query
    { benchId: 'edge_empty_q', category: 'edge-empty', query: '' },

    // 5b: long query (~520 words)
    { benchId: 'edge_long_q', category: 'edge-long', query: LONG_QUERY },

    // 5c: special characters
    { benchId: 'edge_special_q', category: 'edge-special-chars', query: 'What is @the $status of #database? (version 2.0) - [pending] {resolved} | active & ready! *confirmed* _underlined_ <checked> = done?' },

    // 5d: noise - must still find the relevant memory among 10 noise entries
    { benchId: 'edge_noise_q', category: 'edge-noise', query: 'What database does the atlas project use?', expectTop1: ['noise_relevant'] },

    // 5e: partial match - query partially matches but not exactly
    { benchId: 'edge_partial_q', category: 'edge-partial-match', query: 'What rate limiting configuration does the API use?', expectTop1: ['partial_0'] },
  ];
}

// ─── Assembled corpus ───────────────────────────────────────────────────────

export interface BenchCorpus {
  memories: BenchMemory[];
  queries: BenchQuery[];
}

export function buildBenchCorpus(): BenchCorpus {
  return {
    memories: [
      ...buildFactUpdateMemories(),
      ...buildFalsehoodMemories(),
      ...buildPreferenceMemories(),
      ...buildEdgeCaseMemories(),
    ],
    queries: [
      ...buildFactUpdateQueries(),
      ...buildFalsehoodQueries(),
      ...buildPreferenceQueries(),
      ...buildUnanswerableQueries(),
      ...buildEdgeCaseQueries(),
    ],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic ISO timestamp: dayOffset days after 2026-01-01, plus idx hours for stable intra-day ordering. */
export function isoDay(dayOffset: number, idx: number): string {
  return new Date(Date.UTC(2026, 0, 1 + dayOffset, idx % 24)).toISOString();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
