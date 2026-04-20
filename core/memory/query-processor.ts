/**
 * Query Processor - Phase 4
 * Expands queries for better retrieval coverage
 */

export interface ProcessedQuery {
  original: string;
  expanded: string[];
  entities: string[];
  synonyms: Map<string, string[]>;
}

/**
 * Simple synonym expansion without LLM calls
 * Fast, deterministic, no API costs
 */
export function expandQuery(query: string): ProcessedQuery {
  const synonyms = new Map<string, string[]>();
  
  // Define common synonym mappings
  const synonymMap: Record<string, string[]> = {
    'manager': ['manager', 'boss', 'supervisor', 'lead'],
    'team': ['team', 'group', 'staff', 'crew'],
    'project': ['project', 'initiative', 'endeavor', 'work'],
    'start': ['start', 'begin', 'commence', 'initiate'],
    'budget': ['budget', 'funding', 'cost', 'allocation'],
    'language': ['language', 'tech', 'stack', 'technology'],
    'feature': ['feature', 'capability', 'function', 'aspect'],
    'based': ['based', 'located', 'situated', 'headquartered'],
  };
  
  const lowerQuery = query.toLowerCase();
  
  // Find matching synonyms
  for (const [key, values] of Object.entries(synonymMap)) {
    if (lowerQuery.includes(key)) {
      synonyms.set(key, values);
    }
  }
  
  // Generate expanded queries by substituting synonyms
  const expanded: string[] = [query]; // Original
  
  // Add one variation per synonym found
  for (const [term, variants] of synonyms) {
    for (const variant of variants) {
      if (variant !== term) {
        expanded.push(query.replace(new RegExp(term, 'gi'), variant));
      }
    }
  }
  
  // Extract entities (capitalized words), filtering common stopwords
  const STOP_WORDS = new Set([
    'The', 'A', 'An', 'This', 'That', 'These', 'Those',
    'I', 'You', 'We', 'They', 'He', 'She', 'It',
    'What', 'When', 'Where', 'Why', 'How',
    'My', 'Your', 'Our', 'Their', 'Its',
    'If', 'But', 'Or', 'And', 'So', 'Then',
    'Just', 'Only', 'Also', 'Very', 'Too',
    'Has', 'Have', 'Had', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should',
    'Can', 'May', 'Might', 'Must', 'Shall',
    'With', 'Without', 'From', 'Into', 'About', 'After', 'Before', 'Between',
    'During', 'Through', 'Under', 'Over', 'Above', 'Below',
    'All', 'Some', 'Any', 'No', 'Not', 'Each', 'Every', 'Most', 'Many', 'Much',
    'Few', 'Both', 'Either', 'Neither', 'Another', 'Other',
    'Such', 'Same', 'Different', 'New', 'Old', 'First', 'Last', 'Next', 'Last',
    'See', 'Get', 'Make', 'Do', 'Say', 'Tell', 'Know', 'Think', 'Want', 'Use',
    'Find', 'Give', 'Take', 'Show', 'Send', 'Put', 'Keep', 'Let', 'Begin', 'Seem',
  ]);
  
  // Common tech stack terms that ARE entities (preserves known entities)
  const TECH_TERMS = new Set([
    'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'PHP',
    'React', 'Vue', 'Angular', 'Svelte', 'Next', 'Nuxt', 'Astro',
    'Node', 'Express', 'Fastify', 'Deno', 'Bun',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'DynamoDB',
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform',
    'OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'Apple',
    'HTML', 'CSS', 'Tailwind', 'GraphQL', 'REST', 'gRPC', 'WebSocket',
    'CI', 'CD', 'Git', 'GitHub', 'GitLab', 'Bitbucket',
  ]);
  
  const entityMatches = query.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const entities = [...new Set(entityMatches)].filter(e => {
    // Always include known tech terms
    if (TECH_TERMS.has(e)) return true;
    // Filter out stopwords
    return !STOP_WORDS.has(e);
  });
  
  return {
    original: query,
    expanded: [...new Set(expanded)], // Deduplicate
    entities,
    synonyms,
  };
}

/**
 * Multi-query search combiner
 * Searches with multiple query variants and merges results
 */
export async function multiQuerySearch<T>(
  queries: string[],
  searchFn: (query: string) => Promise<T[]>,
  dedupeKey: (item: T) => string
): Promise<T[]> {
  const allResults: T[] = [];
  
  // Search with each query variant
  for (const query of queries) {
    const results = await searchFn(query);
    allResults.push(...results);
  }
  
  // Deduplicate by key
  const seen = new Set<string>();
  const unique: T[] = [];
  
  for (const item of allResults) {
    const key = dedupeKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  
  return unique;
}
