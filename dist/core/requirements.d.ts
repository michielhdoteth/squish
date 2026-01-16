export declare class MemoryRequirementError extends Error {
    readonly missingCriteria: any;
    readonly context?: any | undefined;
    constructor(message: string, missingCriteria: any, context?: any | undefined);
}
export interface MemoryCriteria {
    tag?: string;
    type?: string;
    types?: string[];
    sector?: string;
    minAge?: number;
    maxAge?: number;
    minConfidence?: number;
    minRelevance?: number;
    projectId?: string;
    agentId?: string;
    visibilityScope?: string;
}
export declare function requireMemory(criteria: MemoryCriteria): Promise<any>;
export declare function assertMemoryPresent(memoryId: string): Promise<void>;
export declare function assertMemoryNotPresent(criteria: MemoryCriteria): Promise<void>;
export declare function requireMemories(criteria: MemoryCriteria, minCount?: number): Promise<any[]>;
export declare function requireHighConfidenceMemory(criteria: MemoryCriteria, minConfidence?: number): Promise<any>;
export declare function requireRecentMemory(criteria: MemoryCriteria, maxAgeDays?: number): Promise<any>;
//# sourceMappingURL=requirements.d.ts.map