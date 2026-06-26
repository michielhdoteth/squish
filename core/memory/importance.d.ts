/**
 * Importance Scoring System
 * Calculates and manages memory importance scores (0-100) with temporal decay
 */
import type { Memory } from '../../db/drizzle/schema.js';
export interface ImportanceScore {
    score: number;
    components: {
        base: number;
        recency: number;
        accessFrequency: number;
        typeWeight: number;
        userFlags: number;
    };
    explanation: string;
}
/**
 * Calculate importance score for a memory
 *
 * Formula: base + recency + accessFrequency + typeWeight + userFlags
 * All values are clamped to 0-100 range
 */
export declare function calculateImportance(memory: Partial<Memory>): ImportanceScore;
/**
 * Update importance score for a memory
 * Used when memory is accessed or modified
 */
export declare function updateImportanceScore(memoryId: string, incrementAccess?: boolean): Promise<number>;
/**
 * Get low-importance memories that are candidates for consolidation
 * These are old, rarely accessed memories with low importance scores
 */
export declare function getLowImportanceMemories(projectId: string, options?: {
    minAge?: number;
    maxImportance?: number;
    limit?: number;
}): Promise<any[]>;
/**
 * Set importance score manually (for user override)
 */
export declare function setImportanceScore(memoryId: string, score: number): Promise<void>;
//# sourceMappingURL=importance.d.ts.map