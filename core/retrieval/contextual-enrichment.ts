/**
 * Contextual Retrieval - Enriches memories with context before embedding
 *
 * Based on Anthropic's Contextual Retrieval approach:
 * https://www.anthropic.com/news/contextual-retrieval
 *
 * Prepends a context prefix to each memory's content before embedding,
 * which helps disambiguate short or ambiguous memories.
 *
 * Example:
 *   Original: "Use bun for package management"
 *   Enriched: "[preference] from squish-memory about tooling: Use bun for package management"
 *
 * Usage:
 *   Set SQUISH_CONTEXTUAL_RETRIEVAL=true
 */

import { config } from '../../config.js';
import { logger } from '../logger.js';

export interface ContextualEnrichmentConfig {
  enabled: boolean;
  template: string;
  maxPrefixLength: number;
}

export interface EnrichedContent {
  original: string;
  enriched: string;
  prefix: string;
}

/**
 * Get contextual retrieval configuration from environment variables
 * Reads directly from process.env for testability
 */
export function getContextualConfig(): ContextualEnrichmentConfig {
  return {
    enabled: process.env.SQUISH_CONTEXTUAL_RETRIEVAL === 'true',
    template: process.env.SQUISH_CONTEXTUAL_PREFIX_TEMPLATE || '[TYPE] from [PROJECT] about [TOPICS]: ',
    maxPrefixLength: 100,
  };
}

/**
 * Extract key topics/tags from content
 * Simple keyword extraction without LLM
 */
export function extractTopics(content: string, tags?: string[]): string[] {
  const topics: string[] = [];

  // Use tags if available
  if (tags && tags.length > 0) {
    topics.push(...tags.slice(0, 3));
  }

  // Extract capitalized terms (potential topics)
  // Match whole words starting with uppercase (handles PascalCase like "TypeScript")
  const capitalizedWords = content.match(/\b[A-Z][a-zA-Z]+\b/g) ?? [];
  const uniqueCapitalized = [...new Set(capitalizedWords)].slice(0, 3);
  topics.push(...uniqueCapitalized);

  // Deduplicate and limit
  return [...new Set(topics)].slice(0, 3);
}

/**
 * Generate context prefix for a memory
 */
export function generateContextPrefix(
  content: string,
  options: {
    type?: string;
    project?: string;
    tags?: string[];
    template?: string;
  } = {}
): string {
  const cfg = getContextualConfig();
  const template = options.template ?? cfg.template;

  const topics = extractTopics(content, options.tags);
  const topicStr = topics.length > 0 ? topics.join(', ') : 'general';

  let prefix = template
    .replace('[TYPE]', options.type ?? 'memory')
    .replace('[PROJECT]', options.project ?? 'unknown')
    .replace('[TOPICS]', topicStr);

  // Truncate if too long
  if (prefix.length > cfg.maxPrefixLength) {
    prefix = prefix.slice(0, cfg.maxPrefixLength - 3) + '...';
  }

  return prefix;
}

/**
 * Enrich content with context prefix
 */
export function enrichContent(
  content: string,
  options: {
    type?: string;
    project?: string;
    tags?: string[];
    template?: string;
  } = {}
): EnrichedContent {
  const cfg = getContextualConfig();

  if (!cfg.enabled) {
    return {
      original: content,
      enriched: content,
      prefix: '',
    };
  }

  const prefix = generateContextPrefix(content, options);
  const enriched = prefix ? `${prefix}\n${content}` : content;

  return {
    original: content,
    enriched,
    prefix,
  };
}

/**
 * Batch enrich multiple memories
 */
export function enrichBatch(
  memories: Array<{
    content: string;
    type?: string;
    project?: string;
    tags?: string[];
  }>,
  options: {
    template?: string;
  } = {}
): EnrichedContent[] {
  return memories.map(m =>
    enrichContent(m.content, {
      type: m.type,
      project: m.project,
      tags: m.tags,
      template: options.template,
    })
  );
}

/**
 * Check health of contextual retrieval
 */
export function checkHealth(): {
  enabled: boolean;
  template: string;
} {
  const cfg = getContextualConfig();
  return {
    enabled: cfg.enabled,
    template: cfg.template,
  };
}

export default {
  getContextualConfig,
  extractTopics,
  generateContextPrefix,
  enrichContent,
  enrichBatch,
  checkHealth,
};
