/**
 * Temporal Facts System
 * Manages versioned facts with validity windows
 */
/**
 * Store a new fact with temporal validity
 */
export declare function storeFact(content: string, options?: {
    validFrom?: Date;
    validTo?: Date;
    confidence?: number;
    tags?: string[];
    projectId?: string;
}): Promise<string>;
/**
 * Update a fact by creating a new version
 */
export declare function updateFact(previousFactId: string, newContent: string, reason: string): Promise<string>;
/**
 * Query facts valid at a specific point in time
 */
export declare function queryFactsAtTime(timestamp?: Date, options?: {
    minConfidence?: number;
    tags?: string[];
    projectId?: string;
    limit?: number;
}): Promise<any[]>;
/**
 * Get the complete version history of a fact
 */
export declare function getFactHistory(factId: string): Promise<any[]>;
/**
 * Apply confidence decay based on temporal distance
 */
export declare function applyConfidenceDecay(factId: string, ageDays: number): Promise<void>;
/**
 * Invalidate a fact (mark as no longer valid)
 */
export declare function invalidateFact(factId: string, reason: string): Promise<void>;
/**
 * Check if a fact is currently valid
 */
export declare function isFactValid(factId: string, atTime?: Date): Promise<boolean>;
/**
 * Get statistics about facts
 */
export declare function getFactStats(projectId?: string): Promise<{
    totalFacts: number;
    activeFacts: number;
    expiredFacts: number;
    avgConfidence: number;
    avgAge: number;
}>;
//# sourceMappingURL=temporal-facts.d.ts.map