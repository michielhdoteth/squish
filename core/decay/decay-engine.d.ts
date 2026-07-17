/**
 * Decay Engine - Ebbinghaus Power-Law Implementation
 *
 * Replaces linear decay with Ebbinghaus power-law decay for more accurate
 * memory retention modeling based on the forgetting curve.
 *
 * Reference: Squish v2.0 Architecture Design, Section 7 - Decay Function
 */
import { getDefaultDecayParams, type DecayParams } from './ebbinghaus.js';
/**
 * Memory types and their decay characteristics
 * Based on research from Squish v2.0 architecture:
 * - episodic: β=0.07 (slow decay)
 * - semantic: β=0.02 (very slow)
 * - procedural: β=0.03 (slow)
 * - self-model: β=0.01 (very slow)
 * - introspective: β=0.02 (slow)
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'self-model' | 'introspective' | 'default';
export interface MemoryForDecay {
    id: string;
    score: number;
    memoryType?: string;
    lastDecayAt: Date | string | number;
    createdAt: Date | string | number;
    tau?: number;
    beta?: number;
    /** Memory tier: 'sturdy' = skip decay, 'working' = normal decay, 'long-term' = slow decay, 'fleeting' = faster decay */
    tier?: string;
    /** Whether the memory is pinned (exempt from decay) */
    isPinned?: boolean;
}
export interface DecayEngineStats {
    processed: number;
    updated: number;
    errors: string[];
}
/**
 * Apply Ebbinghaus decay to a single memory
 *
 * @param memory - Memory object with required fields
 * @returns New decayed score
 */
export declare function applyEbbinghausDecay(memory: MemoryForDecay): number;
/**
 * Update decay scores for all memories in the database
 * Uses Ebbinghaus power-law decay instead of linear decay
 *
 * @param projectId - Optional project ID to filter memories
 * @returns Statistics about the decay operation
 */
export declare function updateAllDecayScores(projectId?: string): Promise<DecayEngineStats>;
/**
 * Calculate retention for a memory at a specific time
 * Useful for previewing what the retention will be
 *
 * @param memory - Memory object
 * @param targetDate - Date to calculate retention for (default: now)
 * @returns Retention value between 0 and 1
 */
export declare function previewRetention(memory: MemoryForDecay, targetDate?: Date): number;
/**
 * Get decay parameters for a memory type
 * Exported for use by other modules
 */
export { getDefaultDecayParams };
export type { DecayParams };
//# sourceMappingURL=decay-engine.d.ts.map