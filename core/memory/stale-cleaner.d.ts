/**
 * Stale Memory Cleaner
 * Deletes memories that are old, low-confidence, and low-importance
 */
export interface StaleMemory {
    id: string;
    content: string;
    type: string;
    createdAt: Date;
    confidenceLevel: string | null;
    importanceScore: number | null;
    isPinned: boolean;
}
export interface StaleMemoryQuery {
    olderThanDays: number;
    confidenceLevels: string[];
    minImportance: number;
    projectId?: string;
}
export declare function getStaleMemories(query: StaleMemoryQuery): Promise<StaleMemory[]>;
export declare function deleteMemoryPermanently(memoryId: string): Promise<void>;
export declare function runAutoClean(options?: Partial<StaleMemoryQuery>): Promise<{
    deleted: number;
    summary: Record<string, unknown>;
}>;
//# sourceMappingURL=stale-cleaner.d.ts.map