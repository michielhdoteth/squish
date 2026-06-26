/**
 * Memory Statistics Module
 * Provides memory usage statistics for CLI and MCP
 */
export interface MemoryStats {
    totalMemories: number;
    byType: Record<string, number>;
    totalNotes: number;
    notesByCategory: Record<string, number>;
    totalLearnings: number;
    learningsByType: Record<string, number>;
    totalLinks: number;
    oldestMemory?: string;
    newestMemory?: string;
    projectPath: string;
    mode: string;
    signal?: {
        captured: number;
        suppressed: number;
        sessionOnly: number;
        durable: number;
        durableWithRaw: number;
        tokensSaved: number;
        placeRouted: number;
        graphEnriched: number;
    };
}
/**
 * Get memory statistics for a project
 */
export declare function getMemoryStats(projectPath?: string): Promise<MemoryStats>;
//# sourceMappingURL=stats.d.ts.map