/**
 * Contradiction Resolver
 * Detects and auto-resolves contradictions when writing new memories
 * Implements supersession logic for outdated information
 */
export interface ContradictionResult {
    hasContradiction: boolean;
    supersededMemories: string[];
    confidence: number;
    reason: string;
    /** Which association type to use: 'updates' for explicit replacements, 'supersedes' for temporal contradictions */
    associationType: 'updates' | 'supersedes';
}
export interface ContradictionCheck {
    newContent: string;
    newType: string;
    projectId?: string;
    entities?: string[];
    excludeId?: string;
    newMemoryCreatedAt?: string;
}
/**
 * Detect contradictions between new memory and existing memories
 */
export declare function detectContradictions(check: ContradictionCheck): Promise<ContradictionResult>;
/**
 * Apply supersession to memories - archive old ones and create associations
 */
export declare function applySupersession(newMemoryId: string, supersededIds: string[], confidence: number, associationType?: 'updates' | 'supersedes'): Promise<void>;
/**
 * Check for temporal contradictions (facts that are no longer valid)
 */
export declare function checkTemporalContradictions(content: string, projectId?: string): Promise<string[]>;
/**
 * Integrated contradiction resolution for the write path
 * Call this before storing a new memory
 */
export declare function resolveContradictions(content: string, type: string, projectId?: string, newMemoryId?: string, newMemoryCreatedAt?: string): Promise<{
    shouldProceed: boolean;
    supersededIds: string[];
    confidence: number;
    reason: string;
    associationType: 'updates' | 'supersedes';
}>;
//# sourceMappingURL=contradiction-resolver.d.ts.map