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
export declare function getContextualConfig(): ContextualEnrichmentConfig;
/**
 * Extract key topics/tags from content
 * Simple keyword extraction without LLM
 */
export declare function extractTopics(content: string, tags?: string[]): string[];
/**
 * Generate context prefix for a memory
 */
export declare function generateContextPrefix(content: string, options?: {
    type?: string;
    project?: string;
    tags?: string[];
    template?: string;
}): string;
/**
 * Enrich content with context prefix
 */
export declare function enrichContent(content: string, options?: {
    type?: string;
    project?: string;
    tags?: string[];
    template?: string;
}): EnrichedContent;
/**
 * Batch enrich multiple memories
 */
export declare function enrichBatch(memories: Array<{
    content: string;
    type?: string;
    project?: string;
    tags?: string[];
}>, options?: {
    template?: string;
}): EnrichedContent[];
/**
 * Check health of contextual retrieval
 */
export declare function checkHealth(): {
    enabled: boolean;
    template: string;
};
declare const _default: {
    getContextualConfig: typeof getContextualConfig;
    extractTopics: typeof extractTopics;
    generateContextPrefix: typeof generateContextPrefix;
    enrichContent: typeof enrichContent;
    enrichBatch: typeof enrichBatch;
    checkHealth: typeof checkHealth;
};
export default _default;
//# sourceMappingURL=contextual-enrichment.d.ts.map