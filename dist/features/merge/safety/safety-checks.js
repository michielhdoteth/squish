/**
 * Safety checks to prevent bad merges
 *
 * All safety checks run before creating merge proposals. They can either:
 * - BLOCKER: Hard failure, prevents merge entirely
 * - WARNING: Soft alert, merge proceeds but with warnings
 */
// ============================================================================
// Safety Checks
// ============================================================================
/**
 * Check 1: Immutability
 * Cannot merge memories marked as immutable (isMergeable=false)
 */
const immutabilityCheck = {
    name: 'immutability',
    description: 'Prevent merging immutable memories',
    type: 'blocker',
    check: (memories) => {
        const immutableMemories = memories.filter((m) => !m.isMergeable);
        if (immutableMemories.length > 0) {
            return {
                passed: false,
                warnings: [],
                blockers: [
                    `Cannot merge: ${immutableMemories.length} memory(ies) marked as immutable`,
                    `IDs: ${immutableMemories.map((m) => m.id).join(', ')}`,
                ],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 2: Type Consistency
 * All memories must be the same type
 */
const typeConsistencyCheck = {
    name: 'type_consistency',
    description: 'Ensure all memories are the same type',
    type: 'blocker',
    check: (memories) => {
        const types = new Set(memories.map((m) => m.type));
        if (types.size > 1) {
            return {
                passed: false,
                warnings: [],
                blockers: [
                    `Cannot merge different types: ${Array.from(types).join(', ')}`,
                    'All memories must be the same type (fact, preference, decision, etc.)',
                ],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 3: Already Merged
 * Cannot merge memories that have already been merged into other memories
 */
const alreadyMergedCheck = {
    name: 'already_merged',
    description: 'Prevent re-merging of previously merged memories',
    type: 'blocker',
    check: (memories) => {
        const alreadyMerged = memories.filter((m) => m.isMerged);
        if (alreadyMerged.length > 0) {
            return {
                passed: false,
                warnings: [],
                blockers: [
                    `Cannot merge: ${alreadyMerged.length} memory(ies) already merged`,
                    'Already-merged memories should not be re-merged. Undo the previous merge first.',
                ],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 4: Minimum Similarity
 * Similarity must be above minimum threshold to prevent low-confidence merges
 */
const minimumSimilarityCheck = {
    name: 'min_similarity',
    description: 'Ensure similarity is above minimum threshold',
    type: 'blocker',
    check: (memories, metadata) => {
        const minThreshold = 0.70; // Minimum acceptable similarity
        if (!metadata || !('similarityScore' in metadata)) {
            return { passed: true, warnings: [], blockers: [] }; // No similarity data to check
        }
        const similarity = metadata.similarityScore;
        if (similarity < minThreshold) {
            return {
                passed: false,
                warnings: [],
                blockers: [
                    `Similarity too low: ${(similarity * 100).toFixed(1)}%`,
                    `Minimum required: ${(minThreshold * 100).toFixed(0)}%`,
                    'Increase similarity threshold or select more similar memories',
                ],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 5: Multi-User Warning
 * Warn if merging memories from multiple different users
 * (Soft warning, doesn't block merge)
 */
const multiUserCheck = {
    name: 'multi_user',
    description: 'Warn about merging memories from different users',
    type: 'warning',
    check: (memories) => {
        const users = new Set(memories.map((m) => m.userId).filter(Boolean));
        if (users.size > 1) {
            return {
                passed: true,
                warnings: [
                    `Merging memories from ${users.size} different users`,
                    'This is usually not recommended. Ensure you want to consolidate user-specific memories.',
                ],
                blockers: [],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 6: Privacy Mismatch Warning
 * Warn if merging private and non-private memories
 */
const privacyCheck = {
    name: 'privacy',
    description: 'Warn about mixing private and non-private memories',
    type: 'warning',
    check: (memories) => {
        const privacyStates = new Set(memories.map((m) => m.isPrivate));
        if (privacyStates.size > 1) {
            return {
                passed: true,
                warnings: [
                    'Merging private and non-private memories',
                    'The merged result will inherit the privacy setting of the canonical memory',
                ],
                blockers: [],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 7: Secrets Warning
 * Warn if merging memories containing secrets
 */
const secretsCheck = {
    name: 'secrets',
    description: 'Warn about merging memories with detected secrets',
    type: 'warning',
    check: (memories) => {
        const withSecrets = memories.filter((m) => m.hasSecrets);
        if (withSecrets.length > 0) {
            return {
                passed: true,
                warnings: [
                    `${withSecrets.length} memory(ies) contain detected secrets`,
                    'Ensure the merged content does not expose sensitive information',
                    'Consider redacting secrets before merging',
                ],
                blockers: [],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
/**
 * Check 8: Active Status Check
 * Cannot merge inactive memories
 */
const activeStatusCheck = {
    name: 'active_status',
    description: 'Ensure all memories are active',
    type: 'blocker',
    check: (memories) => {
        const inactive = memories.filter((m) => !m.isActive);
        if (inactive.length > 0) {
            return {
                passed: false,
                warnings: [],
                blockers: [
                    `Cannot merge: ${inactive.length} memory(ies) are inactive (archived/expired)`,
                    'Only active memories can be merged',
                ],
            };
        }
        return { passed: true, warnings: [], blockers: [] };
    },
};
// ============================================================================
// Safety Check Registry
// ============================================================================
export const SAFETY_CHECKS = [
    immutabilityCheck,
    typeConsistencyCheck,
    alreadyMergedCheck,
    minimumSimilarityCheck,
    multiUserCheck,
    privacyCheck,
    secretsCheck,
    activeStatusCheck,
];
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
export function runSafetyChecks(memories, metadata) {
    const results = SAFETY_CHECKS.map((check) => check.check(memories, metadata));
    const allBlockers = results.flatMap((r) => r.blockers);
    const allWarnings = results.flatMap((r) => r.warnings);
    return {
        passed: allBlockers.length === 0,
        warnings: allWarnings,
        blockers: allBlockers,
    };
}
/**
 * Check only blockers (faster, doesn't collect warnings)
 * Use this for pre-filtering candidate pairs before ranking
 */
export function checkBlockers(memories) {
    const blockerChecks = SAFETY_CHECKS.filter((c) => c.type === 'blocker');
    for (const check of blockerChecks) {
        const result = check.check(memories);
        if (!result.passed) {
            return false;
        }
    }
    return true;
}
/**
 * Format safety check results for user display
 */
export function formatSafetyResults(result) {
    if (result.passed && result.warnings.length === 0) {
        return 'All safety checks passed';
    }
    const lines = [];
    if (!result.passed && result.blockers.length > 0) {
        lines.push('BLOCKERS (merge prevented):');
        for (const blocker of result.blockers) {
            lines.push(`  ✗ ${blocker}`);
        }
    }
    if (result.warnings.length > 0) {
        lines.push('WARNINGS (merge allowed with caution):');
        for (const warning of result.warnings) {
            lines.push(`  ⚠ ${warning}`);
        }
    }
    return lines.join('\n');
}
/**
 * Get description of all safety checks
 */
export function describeSafetyChecks() {
    return SAFETY_CHECKS.map((check) => `${check.name} [${check.type}]: ${check.description}`).join('\n');
}
//# sourceMappingURL=safety-checks.js.map