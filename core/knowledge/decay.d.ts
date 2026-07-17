/**
 * Unified Knowledge Decay Engine
 *
 * Applies Ebbinghaus decay to ALL knowledge kinds (memories, beliefs, strategies)
 * with kind-specific parameters.
 */
import type { KnowledgeKind } from './types.js';
/**
 * Apply Ebbinghaus decay to a single knowledge record.
 * Returns the new confidence value.
 */
export declare function decayKnowledgeConfidence(knowledgeId: string): Promise<number>;
/**
 * Apply decay to all active knowledge of a given kind.
 * Returns the number of records decayed.
 */
export declare function decayAllKnowledge(kind: KnowledgeKind, projectId?: string): Promise<{
    decayed: number;
    deprecated: number;
}>;
/**
 * Boost confidence on success (belief confirmation / strategy success).
 * Returns the new confidence value.
 */
export declare function boostConfidence(knowledgeId: string, amount?: number): Promise<number>;
/**
 * Confirm a belief — resets decay timer and boosts confidence.
 */
export declare function confirmBelief(beliefId: string): Promise<number>;
/**
 * Record strategy usage — updates usage stats and confidence.
 */
export declare function recordStrategyUsage(strategyId: string, success: boolean): Promise<number>;
/**
 * Run decay for all knowledge kinds in a project.
 * This is called during the sleep cycle / consolidation.
 */
export declare function runDecayCycle(projectId?: string): Promise<{
    memories: {
        decayed: number;
        deprecated: number;
    };
    beliefs: {
        decayed: number;
        deprecated: number;
    };
    strategies: {
        decayed: number;
        deprecated: number;
    };
}>;
//# sourceMappingURL=decay.d.ts.map