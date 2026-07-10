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
 * Detect temporal references in content
 *
 * @param content - The text content to analyze
 * @returns Object with hasTemporal flag and list of references found
 */
export declare function detectTemporalReferences(content: string): {
    hasTemporal: boolean;
    references: string[];
};
/**
 * Check if a memory is likely stale based on temporal references
 *
 * @param memory - The memory object to check
 * @param memory.content - The memory content
 * @param memory.createdAt - When the memory was created
 * @param memory.lastAccessedAt - When the memory was last accessed (optional)
 * @returns True if the memory is likely stale
 */
export declare function isLikelyStale(memory: {
    content: string;
    createdAt: string;
    lastAccessedAt?: string;
}): boolean;
//# sourceMappingURL=temporal-validity.d.ts.map