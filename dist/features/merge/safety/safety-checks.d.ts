/**
 * Safety checks to prevent bad merges
 *
 * All safety checks run before creating merge proposals. They can either:
 * - BLOCKER: Hard failure, prevents merge entirely
 * - WARNING: Soft alert, merge proceeds but with warnings
 */
import type { Memory } from '../../../drizzle/schema.js';
export interface SafetyCheckResult {
    passed: boolean;
    warnings: string[];
    blockers: string[];
}
export interface SafetyCheck {
    name: string;
    description: string;
    type: 'blocker' | 'warning';
    check(memories: Memory[], metadata?: Record<string, unknown>): SafetyCheckResult;
}
export declare const SAFETY_CHECKS: SafetyCheck[];
/**
 * Run all safety checks on a set of memories
 *
 * Returns combined result with:
 * - passed: true only if all blockers pass
 * - warnings: array of warning messages
 * - blockers: array of blocking error messages
 *
 * Recommendation: Always block if blockers are present, but allow merge if only warnings
 */
export declare function runSafetyChecks(memories: Memory[], metadata?: Record<string, unknown>): SafetyCheckResult;
/**
 * Check only blockers (faster, doesn't collect warnings)
 * Use this for pre-filtering candidate pairs before ranking
 */
export declare function checkBlockers(memories: Memory[]): boolean;
/**
 * Format safety check results for user display
 */
export declare function formatSafetyResults(result: SafetyCheckResult): string;
/**
 * Get description of all safety checks
 */
export declare function describeSafetyChecks(): string;
//# sourceMappingURL=safety-checks.d.ts.map