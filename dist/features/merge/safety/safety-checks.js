/**
 * Safety checks to prevent bad merges.
 * Checks run before creating merge proposals and are categorized as BLOCKER or WARNING.
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
const minimumSimilarityCheck = {
    name: 'min_similarity',
    description: 'Ensure similarity is above minimum threshold',
    type: 'blocker',
    check: (memories, metadata) => {
        const minThreshold = 0.70;
        if (!metadata || !('similarityScore' in metadata)) {
            return { passed: true, warnings: [], blockers: [] };
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
export function describeSafetyChecks() {
    return SAFETY_CHECKS.map((check) => `${check.name} [${check.type}]: ${check.description}`).join('\n');
}
//# sourceMappingURL=safety-checks.js.map