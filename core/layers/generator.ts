/** Layer Extractor - Creates L0/L1 truncated layers for token-efficient hierarchical retrieval */

import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

export interface LayerGenerationConfig {
  l0MaxLength?: number;     // Default: 50 chars (truncated preview)
  l1MaxLength?: number;     // Default: 300 chars (first 2 sentences truncated)
  autoGenerate?: boolean;    // Default: true for content > 500 chars
}

export interface LayerGenerationResult {
  l0?: string;  // Ultra-short truncated preview
  l1?: string;  // Short truncated preview (first 2 sentences)
  l2?: string;  // Full content (reference)
  tokenCounts: { l0: number; l1: number; l2: number };
}

const DEFAULT_CONFIG: LayerGenerationConfig = {
  l0MaxLength: 50,
  l1MaxLength: 300,
  autoGenerate: true,
};

/**
 * Extract L0/L1/L2 layers for content via truncation
 */
export async function extractLayers(
  content: string,
  config: LayerGenerationConfig = {}
): Promise<LayerGenerationResult> {
  const l0MaxLength = config.l0MaxLength ?? DEFAULT_CONFIG.l0MaxLength;
  const l1MaxLength = config.l1MaxLength ?? DEFAULT_CONFIG.l1MaxLength;

  // Extract L0 and L1 in parallel
  const [l0, l1] = await Promise.all([
    extractL0Truncation(content, l0MaxLength!),
    extractL1Truncation(content, l1MaxLength!),
  ]);

  const l2Tokens = countTokens(content);
  const l0Tokens = countTokens(l0 || '');
  const l1Tokens = countTokens(l1 || '');

  return {
    l0: l0 ?? '',
    l1: l1 ?? '',
    l2: content,
    tokenCounts: {
      l0: l0Tokens,
      l1: l1Tokens,
      l2: l2Tokens,
    },
  };
}

/**
 * Extract L0: Ultra-short truncated preview (first sentence or chars)
 */
async function extractL0Truncation(
  content: string,
  maxLength: number
): Promise<string> {
  // Simple truncation for L0 (first sentence or chars)
  const trimmed = content.trim();
  const sentences = trimmed.split(/[.!?]/).filter(s => s.trim().length > 0);

  // Take first non-empty sentence and truncate if needed
  let result = sentences.length > 0 ? sentences[0] : trimmed.substring(0, maxLength);

  if (result.length > maxLength) {
    result = result.substring(0, maxLength - 3) + '...';
  }

  return result.trim();
}

/**
 * Extract L1: Short truncated preview (first 2 meaningful sentences)
 */
async function extractL1Truncation(
  content: string,
  maxLength: number
): Promise<string> {
  // Simple truncation for L1 (first 2 meaningful sentences)
  const trimmed = content.trim();
  const sentences = trimmed.split(/[.!?]/).filter(s => s.trim().length > 10);

  // Take first meaningful sentences and truncate if needed
  let result = sentences.length > 0
    ? sentences.slice(0, 2).join(' ').trim()
    : trimmed.substring(0, maxLength);

  if (result.length > maxLength) {
    result = result.substring(0, maxLength - 3) + '...';
  }

  return result.trim();
}

/**
 * Count tokens (approximate, 4 chars = 1 token for English)
 */
function countTokens(text: string): number {
  // Simple approximation: 4 chars per token
  return Math.ceil(text.length / 4);
}

/**
 * Check if content should have layers auto-extracted
 */
export function shouldAutoGenerate(contentLength: number): boolean {
  const threshold = 500;
  return contentLength > threshold;
}
