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
    tagCap: number;
    garbageTags: Set<string>;
    minLength: number;
}
export interface TagNormalizer {
    normalizeTag(tag: string): string;
    normalizeTags(tags: string[]): string[];
    isValidTag(tag: string): boolean;
}
export declare function createNormalizer(config?: Partial<TagConfig>): TagNormalizer;
export declare const tagNormalizer: TagNormalizer;
//# sourceMappingURL=tag-normalizer.d.ts.map