/**
 * Safety checks to prevent bad merges.
 * Checks run before creating merge proposals and are categorized as BLOCKER or WARNING.
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
export declare function runSafetyChecks(memories: Memory[], metadata?: Record<string, unknown>): SafetyCheckResult;
export declare function checkBlockers(memories: Memory[]): boolean;
export declare function formatSafetyResults(result: SafetyCheckResult): string;
export declare function describeSafetyChecks(): string;
//# sourceMappingURL=safety-checks.d.ts.map