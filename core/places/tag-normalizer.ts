/**
 * Tag Normalizer - Normalize and filter tags for memory organization
 * 
 * Provides consistent tag normalization for the v1.5.0 multi-place routing system.
 * - Lowercase, trim, replace spaces with hyphens
 * - Remove leading/trailing hyphens, collapse multiple hyphens
 * - Filter out garbage/useless tags
 * - Deduplicate and cap at configurable limit
 */

export interface TagConfig {
  tagCap: number;           // max tags per memory (default: 12)
  garbageTags: Set<string>; // tags to filter out
  minLength: number;        // min tag length after normalization (default: 2)
}

export interface TagNormalizer {
  normalizeTag(tag: string): string;
  normalizeTags(tags: string[]): string[];
  isValidTag(tag: string): boolean;
}

const DEFAULT_GARBAGE_TAGS = new Set([
  'ai', 'thing', 'important', 'memory', 'note', 'stuff', 'misc', 'miscellaneous',
  'general', 'various', 'random', 'other', 'unknown', 'todo', 'fixme', 'hack',
  'test', 'debug', 'temp', 'temporary', 'asdf', 'foo', 'bar', 'baz',
]);

const DEFAULT_CONFIG: TagConfig = {
  tagCap: 12,
  garbageTags: DEFAULT_GARBAGE_TAGS,
  minLength: 2,
};

export function createNormalizer(config?: Partial<TagConfig>): TagNormalizer {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  function normalizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')      // spaces to hyphens
      .replace(/^-+/, '')         // leading hyphens
      .replace(/-+$/, '')         // trailing hyphens
      .replace(/-{2,}/g, '-');    // collapse multiple hyphens
  }
  
  function isValidTag(tag: string): boolean {
    const normalized = normalizeTag(tag);
    return (
      normalized.length >= cfg.minLength &&
      !cfg.garbageTags.has(normalized)
    );
  }
  
  function normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    
    for (const tag of tags) {
      const normalized = normalizeTag(tag);
      if (normalized.length < cfg.minLength) continue;
      if (cfg.garbageTags.has(normalized)) continue;
      if (seen.has(normalized)) continue;
      
      seen.add(normalized);
      result.push(normalized);
      
      if (result.length >= cfg.tagCap) break;
    }
    
    return result.sort();
  }
  
  return { normalizeTag, normalizeTags, isValidTag };
}

// Default instance
export const tagNormalizer = createNormalizer();