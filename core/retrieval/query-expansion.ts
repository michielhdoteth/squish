/**
 * Query Expansion Module
 * 
 * Expands short/ambiguous queries with synonyms and related terms
 * before searching. Uses a built-in synonym map for common coding terms.
 * No LLM needed - pure rule-based expansion.
 */

export interface QueryExpansionConfig {
  enabled: boolean;
  maxExpansions: number;  // default: 3
}

/**
 * Synonym map for common coding terms
 */
const SYNONYM_MAP: Record<string, string[]> = {
  // Bug fixing
  fix: ['resolve', 'patch', 'repair'],
  bug: ['issue', 'error', 'problem'],
  debug: ['troubleshoot', 'diagnose', 'investigate'],
  
  // Testing
  test: ['verify', 'validate', 'check'],
  testing: ['verification', 'validation', 'quality assurance'],
  
  // Implementation
  implement: ['build', 'create', 'develop'],
  build: ['implement', 'construct', 'assemble'],
  create: ['implement', 'generate', 'produce'],
  
  // Refactoring
  refactor: ['restructure', 'reorganize', 'clean'],
  restructure: ['refactor', 'reorganize', 'rebuild'],
  
  // Documentation
  document: ['describe', 'annotate', 'record'],
  documentation: ['description', 'annotation', 'records'],
  
  // Performance
  optimize: ['improve', 'enhance', 'speed up'],
  performance: ['speed', 'efficiency', 'optimization'],
  
  // Architecture
  design: ['architect', 'plan', 'structure'],
  architecture: ['structure', 'design', 'framework'],
  
  // Common verbs
  update: ['modify', 'change', 'revise'],
  modify: ['update', 'change', 'alter'],
  delete: ['remove', 'eliminate', 'purge'],
  remove: ['delete', 'eliminate', 'strip'],
  
  // Data operations
  fetch: ['retrieve', 'get', 'load'],
  retrieve: ['fetch', 'get', 'obtain'],
  store: ['save', 'persist', 'cache'],
  save: ['store', 'persist', 'write'],
};

/**
 * Common stop words to ignore during expansion
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'these', 'those', 'what', 'which',
  'who', 'whom', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
]);

/**
 * Expand query with synonyms and related terms
 * 
 * @param query - The original search query
 * @param config - Configuration for query expansion
 * @returns Array of expanded queries (including original)
 */
export function expandQuery(
  query: string,
  config?: QueryExpansionConfig
): string[] {
  const cfg: QueryExpansionConfig = {
    enabled: true,
    maxExpansions: 3,
    ...config,
  };

  // Return original if disabled or empty
  if (!cfg.enabled || !query || query.trim() === '') {
    return [query];
  }

  const expansions: string[] = [query];
  const lowerQuery = query.toLowerCase();
  
  // Split compound queries (on "and", "or", ",")
  const parts = query.split(/\s+(?:and|or|,)\s+/i).filter(p => p.trim());
  
  // Extract meaningful words (excluding stop words)
  const words = lowerQuery
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Find synonyms for each meaningful word and create expansions
  // Group synonyms by word to create balanced expansions
  const wordSynonyms: Map<string, string[]> = new Map();
  
  for (const word of words) {
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      wordSynonyms.set(word, synonyms);
    }
  }

  // Create expansions by interleaving synonyms from different words
  // This ensures diverse coverage across multiple query terms
  const usedExpansions = new Set<string>([query]);
  const wordEntries = Array.from(wordSynonyms.entries());
  
  // Round-robin through words, adding one synonym per word per round
  let round = 0;
  while (expansions.length < cfg.maxExpansions + 1) {
    let addedInRound = false;
    
    for (const [word, synonyms] of wordEntries) {
      if (round < synonyms.length) {
        const synonym = synonyms[round];
        const expanded = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), synonym);
        
        if (expanded !== query && !usedExpansions.has(expanded)) {
          usedExpansions.add(expanded);
          expansions.push(expanded);
          addedInRound = true;
          
          if (expansions.length >= cfg.maxExpansions + 1) break;
        }
      }
    }
    
    // If no expansions were added in this round, we're done
    if (!addedInRound) break;
    round++;
  }

  // If we have compound parts, add them as separate queries
  if (parts.length > 1) {
    for (const part of parts) {
      if (expansions.length >= cfg.maxExpansions + 1) break;
      const trimmed = part.trim();
      if (trimmed && !expansions.includes(trimmed)) {
        expansions.push(trimmed);
      }
    }
  }

  return expansions;
}
