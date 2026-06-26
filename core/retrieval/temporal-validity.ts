/**
 * Temporal Validity Tracking Module
 * 
 * Tracks when facts become invalid (e.g., "we use version 2.0" becomes
 * invalid when version 3.0 is released). Detects temporal references
 * and checks if memories are likely stale.
 */

export interface TemporalConfig {
  enabled: boolean;
}

/**
 * Temporal reference patterns
 */
const TEMPORAL_PATTERNS = {
  // "as of 2024", "as of January 2024"
  asOf: /\bas\s+of\s+(\w+\s+)?\d{4}\b/gi,
  
  // "since version 2.0", "since v3.1"
  sinceVersion: /\bsince\s+(?:version\s+|v\s*)?\d+\.\d+/gi,
  
  // "currently using", "currently on"
  currentlyUsing: /\bcurrently\s+(?:using|on|running|working\s+with)\b/gi,
  
  // "as of now", "as of today"
  asOfNow: /\bas\s+of\s+(?:now|today|this\s+writing)\b/gi,
  
  // Year references: "in 2023", "during 2022", "since 2021"
  yearReference: /\b(?:in|during|since|before|after|until)\s+\d{4}\b/gi,
  
  // Version references: "version 2.0", "v1.5", "v2.3.1"
  versionReference: /\b(?:version\s+|v\s*)\d+\.\d+(?:\.\d+)?\b/gi,
  
  // Date references: "January 2024", "Jan 2023", "March 15, 2022"
  dateReference: /\b(?:\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})\b/gi,
  
  // Relative time: "last week", "next month", "two years ago"
  relativeTime: /\b(?:last|next|past|previous|upcoming)\s+(?:week|month|year|quarter|day)\b/gi,
  
  // "used to be", "was previously"
  pastTense: /\b(?:used\s+to\s+be|was\s+previously|previously\s+used|formerly)\b/gi,
};

/**
 * Detect temporal references in content
 * 
 * @param content - The text content to analyze
 * @returns Object with hasTemporal flag and list of references found
 */
export function detectTemporalReferences(content: string): {
  hasTemporal: boolean;
  references: string[];
} {
  const references: string[] = [];
  
  // Check each pattern category
  for (const [key, pattern] of Object.entries(TEMPORAL_PATTERNS)) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      references.push(match[0]);
    }
  }
  
  // Deduplicate references
  const uniqueReferences = [...new Set(references)];
  
  return {
    hasTemporal: uniqueReferences.length > 0,
    references: uniqueReferences,
  };
}

/**
 * Check if a memory is likely stale based on temporal references
 * 
 * @param memory - The memory object to check
 * @param memory.content - The memory content
 * @param memory.createdAt - When the memory was created
 * @param memory.lastAccessedAt - When the memory was last accessed (optional)
 * @returns True if the memory is likely stale
 */
export function isLikelyStale(memory: {
  content: string;
  createdAt: string;
  lastAccessedAt?: string;
}): boolean {
  const { content, createdAt, lastAccessedAt } = memory;
  
  // Check for temporal references
  const { hasTemporal, references } = detectTemporalReferences(content);
  
  // If no temporal references, not likely stale
  if (!hasTemporal) {
    return false;
  }
  
  const currentYear = new Date().getFullYear();
  const createdDate = new Date(createdAt);
  const ageInDays = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
  
  // Check for year references that are old
  for (const ref of references) {
    // Extract year from reference
    const yearMatch = ref.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const referencedYear = parseInt(yearMatch[1]);
      const yearAge = currentYear - referencedYear;
      
      // If reference is more than 2 years old, likely stale
      if (yearAge > 2) {
        return true;
      }
    }
    
    // Check for old version references
    const versionMatch = ref.match(/(?:version\s+|v\s*)(\d+)\.(\d+)/i);
    if (versionMatch) {
      const majorVersion = parseInt(versionMatch[1]);
      const minorVersion = parseInt(versionMatch[2]);
      
      // Heuristic: very old major versions are likely stale
      // This is a simple heuristic - in production, you'd want domain-specific logic
      if (majorVersion <= 1 && minorVersion <= 2) {
        return true;
      }
    }
  }
  
  // If memory is very old (more than 180 days) and has temporal references
  if (ageInDays > 180 && hasTemporal) {
    // Check if it was recently accessed
    if (lastAccessedAt) {
      const lastAccessed = new Date(lastAccessedAt);
      const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
      
      // If accessed in last 30 days, not stale
      if (daysSinceAccess < 30) {
        return false;
      }
    }
    
    // Old memory with temporal references, not recently accessed
    return true;
  }
  
  return false;
}
