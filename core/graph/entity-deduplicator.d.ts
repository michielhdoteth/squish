/**
 * Entity Deduplicator
 *
 * Deduplicates entities using embedding similarity and string matching.
 * Critical for knowledge graph - prevents duplicate nodes for aliases like "AWS" / "Amazon Web Services".
 */
export interface DeduplicationResult {
    merged: number;
    aliases: Array<{
        from: string;
        to: string;
        similarity: number;
    }>;
    totalEntities: number;
    uniqueEntities: number;
}
/**
 * Find and merge duplicate entities in a project.
 */
export declare function deduplicateProjectEntities(projectId: string, options?: {
    similarityThreshold?: number;
    dryRun?: boolean;
}): Promise<DeduplicationResult>;
//# sourceMappingURL=entity-deduplicator.d.ts.map