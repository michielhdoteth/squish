/**
 * Places Rules Engine - Auto-assignment logic
 *
 * Evaluates which place a memory should be assigned to based on:
 * - Tool used (Write, Edit, Task, etc.)
 * - Content keywords
 * - Tags
 * - Memory type
 */
import type { PlaceType } from './places.js';
export interface PlaceCandidate {
    type: PlaceType;
    weight: number;
    reason?: string;
    source: 'heuristic' | 'llm' | 'manual' | 'dream';
}
export interface PlaceRule {
    id: string;
    projectId: string;
    name: string;
    placeType: PlaceType;
    matchTool: string | null;
    matchKeyword: string | null;
    matchTag: string | null;
    matchMemoryType: string | null;
    priority: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface PlaceRuleCreateInput {
    projectId?: string;
    name: string;
    placeType: PlaceType;
    matchTool?: string;
    matchKeyword?: string;
    matchTag?: string;
    matchMemoryType?: string;
    priority?: number;
    enabled?: boolean;
}
export interface RuleMatchInput {
    toolName?: string;
    content?: string;
    tags?: string[];
    memoryType?: string;
}
/**
 * Default auto-assignment rules
 */
export declare const DEFAULT_RULES: Omit<PlaceRuleCreateInput, 'projectId'>[];
/**
 * Create a place rule
 */
export declare function createPlaceRule(input: PlaceRuleCreateInput): Promise<PlaceRule>;
/**
 * Get rules for a project or global scope
 */
export declare function getProjectRules(projectId?: string): Promise<PlaceRule[]>;
/**
 * Check if a rule matches the input
 * A rule matches only if ALL of its specified conditions are met.
 */
export declare function matchesRule(rule: PlaceRule, input: RuleMatchInput): boolean;
/**
 * Find ALL matching places for a memory, ranked by priority/weight
 * Returns ranked candidates instead of a single place
 */
export declare function findMatchingPlaces(projectId: string | undefined, input: RuleMatchInput): Promise<PlaceCandidate[]>;
/**
 * Find matching place for a memory based on rules (backward compatible)
 * Returns the single best match
 */
export declare function findMatchingPlace(projectId: string | undefined, input: RuleMatchInput): Promise<PlaceType | null>;
/**
 * Adjacent places for retrieval fallback
 */
export declare const ADJACENT_PLACES: Record<PlaceType, PlaceType[]>;
/**
 * Get adjacent places for fallback retrieval
 */
export declare function getAdjacentPlaces(place: PlaceType): PlaceType[];
/**
 * Initialize default rules for a project or global scope.
 * If no projectId provided, uses the global scope.
 */
export declare function initializeDefaultRules(projectId?: string): Promise<PlaceRule[]>;
/**
 * Delete a rule
 */
export declare function deletePlaceRule(id: string): Promise<boolean>;
/**
 * Update a rule
 */
export declare function updatePlaceRule(id: string, updates: Partial<PlaceRuleCreateInput>): Promise<PlaceRule | null>;
//# sourceMappingURL=rules.d.ts.map