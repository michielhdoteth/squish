export interface ConsolidationStats {
    clustered: number;
    merged: number;
    tokensRecovered: number;
}
export declare function consolidateMemories(projectId?: string): Promise<ConsolidationStats>;
export declare function getDeduplicationStats(projectId?: string): Promise<{
    totalMemories: number;
    potentialDuplicates: number;
    estimatedRecovery: number;
}>;
//# sourceMappingURL=consolidation.d.ts.map