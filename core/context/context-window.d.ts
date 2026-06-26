export interface ContextWindowConfig {
    maxTokens: number;
    warningThreshold: number;
    criticalThreshold: number;
}
export declare const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig;
export interface TokenUsageStats {
    coreMemoryTokens: number;
    memoriesTokens: number;
    totalTokens: number;
    maxTokens: number;
    usagePercent: number;
    status: 'ok' | 'warning' | 'critical';
    remainingTokens: number;
}
export interface OptimizationSuggestion {
    type: 'drop' | 'summarize' | 'consolidate';
    memoryId: string;
    memoryType: string;
    contentPreview: string;
    tokens: number;
    reason: string;
    priority: number;
}
export declare function estimateTokens(content: string): number;
export declare function getTokenUsage(projectPath: string): Promise<TokenUsageStats>;
export declare function checkContextLimit(projectPath: string, additionalTokens: number): Promise<{
    ok: boolean;
    warning?: string;
    stats: TokenUsageStats;
}>;
export declare function getOptimizationSuggestions(projectPath: string): Promise<OptimizationSuggestion[]>;
export declare function getContextWindowStatus(projectPath: string): Promise<{
    config: ContextWindowConfig;
    usage: TokenUsageStats;
    suggestions: OptimizationSuggestion[];
    memoryCount: number;
    coreMemorySections: number;
}>;
//# sourceMappingURL=context-window.d.ts.map