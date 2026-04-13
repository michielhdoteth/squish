/**
 * TOON Compression - Token-efficient memory format
 * 
 * Compact format for memory context using abbreviated notation.
 * Achieves efficient token usage for context injection.
 * 
 * Format:
 * {
 *   m:[type],      // memory type (1-2 chars)
 *   c:"...",       // content (truncated)
 *   t:[],          // tags (array)
 *   d:123          // days ago
 * }
 */

const MAX_CONTENT_LENGTH = 80; // Max chars per content
const MAX_TAGS = 3; // Max tags to include

/**
 * Compress a memory to TOON format
 */
export function compressForContext(content: string): string {
  // If not JSON or already short, just return
  if (!isJson(content) || content.length <= MAX_CONTENT_LENGTH) {
    return content;
  }

  try {
    const parsed = JSON.parse(content);
    
    // Build compact TOON object
    const toon: any = {
      m: parsed.type?.substring(0, 2) || 'ob', // observation -> ob
    };

    // Truncate content
    if (parsed.content) {
      const truncated = parsed.content.substring(0, MAX_CONTENT_LENGTH);
      toon.c = truncated.length < parsed.content.length ? truncated + '..' : truncated;
    }

    // Add tags (limited)
    if (parsed.tags && Array.isArray(parsed.tags)) {
      toon.t = parsed.tags.slice(0, MAX_TAGS);
    }

    // Add days ago if there's a date
    if (parsed.createdAt) {
      const days = Math.floor((Date.now() - new Date(parsed.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        toon.d = days;
      }
    }

    return JSON.stringify(toon);
  } catch {
    // Not parseable JSON, return truncated content
    return content.substring(0, MAX_CONTENT_LENGTH);
  }
}

/**
 * Decompress TOON back to readable format
 */
export function decompressFromContext(toonString: string): string {
  // Check if it's TOON format
  if (!isToon(toonString)) {
    return toonString;
  }

  try {
    const parsed = JSON.parse(toonString);
    
    // If it has TOON markers, expand it
    if (parsed.m || parsed.c || parsed.t) {
      const typeMap: Record<string, string> = {
        ob: 'observation',
        su: 'success',
        f: 'failure',
        fx: 'fix',
        i: 'insight',
      };
      
      const type = typeMap[parsed.m] || 'observation';
      const parts = [`[${type}]`];
      
      if (parsed.c) {
        parts.push(parsed.c);
      }
      
      if (parsed.t && parsed.t.length > 0) {
        parts.push(`#${parsed.t.join(' #')}`);
      }
      
      if (parsed.d) {
        parts.push(`(${parsed.d}d ago)`);
      }
      
      return parts.join(' ');
    }
    
    return toonString;
  } catch {
    // Not valid TOON, return as-is
    return toonString;
  }
}

/**
 * Estimate compression ratio
 */
export function estimateCompressionRatio(content: string): number {
  if (!isJson(content) || content.length <= MAX_CONTENT_LENGTH) {
    return 1.0;
  }

  const compressed = compressForContext(content);
  return compressed.length / content.length;
}

/**
 * Check if content is JSON
 */
export function isJson(content: string): boolean {
  try { JSON.parse(content); return true; } catch { return false; }
}

/**
 * Check if content is TOON format
 */
export function isToon(content: string): boolean {
  if (!content.startsWith('{') || !content.endsWith('}')) {
    return false;
  }
  
  try {
    const parsed = JSON.parse(content);
    // Has TOON markers
    return parsed.m !== undefined || parsed.c !== undefined;
  } catch {
    return false;
  }
}

/**
 * Count tokens (rough estimate)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate to token budget
 */
export function truncateToTokenBudget(content: string, maxTokens: number): string {
  const tokens = estimateTokens(content);
  if (tokens <= maxTokens) {
    return content;
  }

  // Binary search for the right length
  let low = 0;
  let high = content.length;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const estimated = estimateTokens(content.substring(0, mid));
    
    if (estimated <= maxTokens) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return content.substring(0, low) + '...';
}