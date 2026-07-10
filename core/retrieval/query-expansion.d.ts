/**
 * Query Expansion Module
 *
 * Expands short/ambiguous queries with synonyms and related terms
 * before searching. Uses a built-in synonym map for common coding terms.
 * No LLM needed - pure rule-based expansion.
 */
export interface QueryExpansionConfig {
    enabled: boolean;
    maxExpansions: number;
}
/**
 * Expand query with synonyms and related terms
 *
 * @param query - The original search query
 * @param config - Configuration for query expansion
 * @returns Array of expanded queries (including original)
 */
export declare function expandQuery(query: string, config?: QueryExpansionConfig): string[];
//# sourceMappingURL=query-expansion.d.ts.map