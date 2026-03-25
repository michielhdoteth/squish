import { getEmbedding } from '../../core/embeddings.js';
import { MemoryType } from './memories.js';

export interface CategorizationResult {
  suggestedType: MemoryType;
  suggestedTags: string[];
  hierarchicalTags: string[];
  concepts: string[];
  fileScopes: string[];
  confidence: number;
}

export interface TagScore {
  tag: string;
  score: number;
  isNew: boolean;
  category: string;
}

const MEMORY_TYPE_PATTERNS: Array<{ type: MemoryType; patterns: RegExp[]; weight: number }> = [
  {
    type: 'decision',
    patterns: [
      /\b(i\s+(?:decided|chose|went\s+with|selected|picked)|we\s+(?:decided|chose|went\s+with)|the\s+(?:decision|choice)\s+(?:is|was)|let's\s+go\s+with|going\s+with\s+\w+)\b/i,
      /\b(over\s+the\s+other|instead\s+of|x\s+over\s+y|better\s+to|best\s+(?:option|choice|approach))\b/i,
      /\b(final\s+decision|decided\s+to|make\s+a\s+decision)\b/i,
    ],
    weight: 3,
  },
  {
    type: 'preference',
    patterns: [
      /\b(i\s+(?:prefer|like|hate|dislike|love)|my\s+(?:preference|favorite)|i'd\s+rather|i\s+(?:always|never)\s+)\b/i,
      /\b(in\s+general|i\s+tend\s+to|i\s+usually|i\s+typically)\b/i,
      /\b(better\s+to|better\s+if|nice\s+to\s+have|prefer\s+)\b/i,
    ],
    weight: 2,
  },
  {
    type: 'context',
    patterns: [
      /\b(remember\s+that|keep\s+in\s+mind|note\s+that|important:|from\s+now\s+on|going\s+forward)\b/i,
      /\b(standard\s+(?:practice|workflow|approach)|we\s+(?:always|usually)\s+|never\s+forget)\b/i,
      /\b(reminder:|warning:|caution:|pro-tip:|tip:\s*)\b/i,
    ],
    weight: 2,
  },
  {
    type: 'fact',
    patterns: [
      /\b(is|are|was|were|has|have|uses?|depends\s+on|requires?|located\s+at|sits?\s+on)\b/i,
      /\b(the\s+\w+\s+(?:file|directory|module|class|function|variable|config|setting))\b/i,
      /\b(in\s+the|at\s+location|under\s+path)\b/i,
    ],
    weight: 1,
  },
];

const TAG_CATEGORIES: Record<string, RegExp[]> = {
  'language': [
    /\b(typescript|javascript|python|rust|go|java|c\+\+|c#|ruby|php|swift|kotlin|scala|elixir|clojure|haskell)\b/gi,
  ],
  'framework': [
    /\b(react|vue|angular|svelte|nextjs|nuxt|express|fastify|nestjs|django|flask|spring|rails|laravel|\.net|unity|unreal)\b/gi,
  ],
  'tool': [
    /\b(docker|kubernetes|git|github|gitlab|jenkins|travis|github\s+actions|terraform|ansible|puppet|chef)\b/gi,
  ],
  'database': [
    /\b(postgresql|postgres|mysql|mongodb|redis|sqlite|elasticsearch|cassandra|dynamodb|neo4j|graphQL|prisma|drizzle)\b/gi,
  ],
  'concept': [
    /\b(api|rest|graphql|websocket|oauth|jwt|ssl|tls|https?|crud|tdd|bdd|pipeline|microservices|serverless)\b/gi,
  ],
  'project': [
    /\b(architecture|design|pattern|structure|directory|folder|file|module|component|service|controller|route|handler)\b/gi,
  ],
  'workflow': [
    /\b(review|pr|merge|deploy|build|test|debug|optimize|refactor|legacy|deprecated|migration|upgrade)\b/gi,
  ],
  'error': [
    /\b(error|bug|issue|exception|fallback|failure|crash|timeout|panic|assert|warn)\b/gi,
  ],
};

const HIERARCHICAL_TAG_PREFIXES: Record<string, string> = {
  'lang:': 'language',
  'fw:': 'framework',
  'db:': 'database',
  'tool:': 'tool',
  'concept:': 'concept',
  'proj:': 'project',
  'wf:': 'workflow',
  'file:': 'file',
  'dir:': 'directory',
};

export async function categorizeMemory(
  content: string,
  existingTags: string[] = []
): Promise<CategorizationResult> {
  const typeScores: Record<MemoryType, number> = {
    observation: 0,
    fact: 0,
    decision: 0,
    context: 0,
    preference: 0,
    jot: 0,
  };

  for (const { type, patterns, weight } of MEMORY_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        typeScores[type] += weight;
      }
    }
  }

  const sortedTypes = Object.entries(typeScores)
    .sort(([, a], [, b]) => b - a);

  const suggestedType = sortedTypes[0][1] > 0 
    ? sortedTypes[0][0] as MemoryType 
    : 'observation';

  const tagScores = await scoreAndSuggestTags(content, existingTags);

  const suggestedTags = tagScores
    .filter(t => t.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(t => t.tag);

  const hierarchicalTags = suggestedTags.map((tag, idx) => {
    const score = tagScores[idx]?.score ?? 0;
    const category = tagScores[idx]?.category ?? 'general';
    const prefix = Object.entries(HIERARCHICAL_TAG_PREFIXES).find(
      ([, v]) => v === category
    )?.[0] ?? '';
    return prefix ? `${prefix}${tag}` : tag;
  });

  const concepts = extractConcepts(content);
  const fileScopes = extractFileScopes(content);

  const maxScore = sortedTypes[0][1];
  const confidence = Math.min(maxScore / 5, 1);

  return {
    suggestedType,
    suggestedTags,
    hierarchicalTags,
    concepts,
    fileScopes,
    confidence,
  };
}

async function scoreAndSuggestTags(
  content: string,
  existingTags: string[]
): Promise<TagScore[]> {
  const contentLower = content.toLowerCase();
  const existingLower = new Set(existingTags.map(t => t.toLowerCase()));
  const allScores: TagScore[] = [];

  for (const [category, patterns] of Object.entries(TAG_CATEGORIES)) {
    const matches: string[] = [];
    
    for (const pattern of patterns) {
      const found = contentLower.match(pattern);
      if (found) {
        matches.push(...found.map(m => m.toLowerCase()));
      }
    }

    const uniqueMatches = [...new Set(matches)];
    for (const match of uniqueMatches) {
      const score = calculateTagScore(match, content, category);
      const isNew = !existingLower.has(match);
      
      allScores.push({
        tag: match,
        score: isNew ? score : score * 0.5,
        isNew,
        category,
      });
    }
  }

  const projectTags = extractProjectTags(content);
  for (const tag of projectTags) {
    allScores.push({
      tag,
      score: 0.7,
      isNew: !existingLower.has(tag.toLowerCase()),
      category: 'project',
    });
  }

  return allScores;
}

function calculateTagScore(tag: string, content: string, category: string): number {
  const tagLength = tag.length;
  const contentLower = content.toLowerCase();
  const tagLower = tag.toLowerCase();
  
  const occurrences = (contentLower.match(new RegExp(tagLower, 'g')) || []).length;
  const density = occurrences * tagLength / content.length;
  
  const categoryBonus = {
    'language': 1.2,
    'framework': 1.1,
    'database': 1.1,
    'tool': 1.0,
    'concept': 0.9,
    'project': 0.8,
    'workflow': 0.9,
  }[category] ?? 1.0;

  let score = Math.min(density * 10 * categoryBonus, 1);

  if (occurrences > 1) {
    score = Math.min(score + 0.2, 1);
  }

  return Math.max(score, 0.1);
}

function extractConcepts(content: string): string[] {
  const concepts: string[] = [];
  const pattern = /\b([a-z]+[A-Z][a-zA-Z0-9]*|[A-Z]+[a-z]+[A-Z][a-zA-Z0-9]*)\b/g;
  const matches = content.match(pattern);
  
  if (matches) {
    const unique = [...new Set(matches)];
    concepts.push(...unique.slice(0, 5));
  }

  const knownConcepts = [
    'api', 'cli', 'sdk', 'ui', 'ux', 'ide', 'orm', 'mvc', 'crud', 'api',
    'auth', 'jwt', 'oauth', 'rest', 'grpc', 'websocket', 'graphql',
  ];

  const found = knownConcepts.filter(c => 
    new RegExp(`\\b${c}\\b`, 'i').test(content)
  );

  return [...new Set([...concepts, ...found])].slice(0, 8);
}

function extractFileScopes(content: string): string[] {
  const scopes: string[] = [];

  const pathPatterns = [
    /(['"])(\/[\w\-\.\/]+(?:\.[a-z]+)?)(['"])/g,
    /(?:from|import|require)\s+['"]([\w\-\.\/]+)['"]/g,
    /<([\w\-\.\/]+)(?:\.[a-z]+)?>/g,
    /file:\s*([\w\-\.\/]+)/gi,
    /in\s+([\w\-\.\/]+\.[a-z]+)/gi,
  ];

  for (const pattern of pathPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const path = match[1] || match[2] || match[3];
      if (path && path.length < 100) {
        const normalized = normalizeFilePath(path);
        if (normalized && !scopes.includes(normalized)) {
          scopes.push(normalized);
        }
      }
    }
  }

  return scopes.slice(0, 3);
}

function normalizeFilePath(path: string): string {
  const cleaned = path
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^\.\.?\/?/, '')
    .split('/')
    .filter(Boolean)
    .join('/');
  
  const parts = cleaned.split('/');
  if (parts.length > 3) {
    return parts.slice(-3).join('/');
  }
  return cleaned || '';
}

function extractProjectTags(content: string): string[] {
  const tags: string[] = [];

  const projectPattern = /\bproject[:\-]?(\w+)/gi;
  let match;
  while ((match = projectPattern.exec(content)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  const dotfilePattern = /^\.?([a-zA-Z0-9_\-]+)\.(json|yaml|yml|toml|config|cfg|ini|env)/m;
  const dotfileMatch = content.match(dotfilePattern);
  if (dotfileMatch) {
    tags.push(dotfileMatch[1].toLowerCase());
  }

  return tags;
}

export function parseHierarchicalTag(tag: string): { prefix: string | null; name: string } {
  for (const [prefix, _category] of Object.entries(HIERARCHICAL_TAG_PREFIXES)) {
    if (tag.startsWith(prefix)) {
      return { prefix, name: tag.slice(prefix.length) };
    }
  }
  return { prefix: null, name: tag };
}

export function buildTagHierarchy(tags: string[]): Map<string, string[]> {
  const hierarchy = new Map<string, string[]>();

  for (const tag of tags) {
    const { prefix, name } = parseHierarchicalTag(tag);
    const category = prefix 
      ? Object.entries(HIERARCHICAL_TAG_PREFIXES).find(([p]) => p === prefix)?.[1] ?? 'custom'
      : 'general';

    if (!hierarchy.has(category)) {
      hierarchy.set(category, []);
    }
    hierarchy.get(category)!.push(tag);
  }

  return hierarchy;
}

export async function suggestTagsFromEmbedding(
  content: string,
  existingTags: string[],
  similarMemories: Array<{ tags: string[]; content: string }>
): Promise<string[]> {
  if (similarMemories.length === 0) {
    return [];
  }

  const existingLower = new Set(existingTags.map(t => t.toLowerCase()));
  const tagCounts: Record<string, number> = {};

  for (const memory of similarMemories) {
    for (const tag of memory.tags) {
      if (!existingLower.has(tag.toLowerCase())) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }
  }

  return Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .filter(([, count]) => count >= 2)
    .slice(0, 3)
    .map(([tag]) => tag);
}

export function generateTagVariants(tag: string): string[] {
  const variants: string[] = [tag];

  const lower = tag.toLowerCase();
  const upper = tag.toUpperCase();
  const capitalize = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();

  if (lower !== tag) variants.push(lower);
  if (upper !== tag) variants.push(upper);
  if (capitalize !== tag) variants.push(capitalize);

  const snakeCase = tag.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  if (snakeCase !== tag && snakeCase !== lower) {
    variants.push(snakeCase);
  }

  const kebabCase = tag.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  if (kebabCase !== tag && kebabCase !== lower && kebabCase !== snakeCase) {
    variants.push(kebabCase);
  }

  return [...new Set(variants)];
}