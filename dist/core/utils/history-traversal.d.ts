/**
 * Shared History and Version Tracking Utilities
 * Common patterns for traversing version chains and history
 */
/**
 * Traverse superseded fact chain (specific to memories table)
 * Follows the supersededBy chain to build complete version history
 */
export declare function traverseSupersededChain(startFactId: string, options?: {
    maxDepth?: number;
    includeStart?: boolean;
}): Promise<any[]>;
//# sourceMappingURL=history-traversal.d.ts.map