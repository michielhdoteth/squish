/**
 * Safety checks to prevent bad merges.
 * Checks run before creating merge proposals and are categorized as BLOCKER or WARNING.
 */

import type { Memory } from '../../../db/drizzle/schema.js';
import type { SafetyCheckResult } from '../../lib/types.js';

export interface SafetyCheck {
  name: string;
  description: string;
  type: 'blocker' | 'warning'; // How to treat failures
  check(memories: Memory[], metadata?: Record<string, unknown>): SafetyCheckResult;
}

const PASSED_RESULT: SafetyCheckResult = { passed: true, warnings: [], blockers: [] };

function createBlockerCheck(
  name: string,
  description: string,
  checkFn: (memories: Memory[], metadata?: Record<string, unknown>) => { passed: boolean; blockers: string[] }
): SafetyCheck {
  return {
    name,
    description,
    type: 'blocker',
    check: (memories, metadata) => {
      const result = checkFn(memories, metadata);
      return result.passed ? PASSED_RESULT : { passed: false, warnings: [], blockers: result.blockers };
    },
  };
}

function createWarningCheck(
  name: string,
  description: string,
  checkFn: (memories: Memory[], metadata?: Record<string, unknown>) => { warnings: string[] }
): SafetyCheck {
  return {
    name,
    description,
    type: 'warning',
    check: (memories, metadata) => {
      const result = checkFn(memories, metadata);
      return { passed: true, warnings: result.warnings, blockers: [] };
    },
  };
}

export const SAFETY_CHECKS: SafetyCheck[] = [
  createBlockerCheck(
    'immutability',
    'Prevent merging immutable memories',
    (memories) => {
      const immutableMemories = memories.filter((m) => !m.isMergeable);
      if (immutableMemories.length === 0) {
        return { passed: true, blockers: [] };
      }
      return {
        passed: false,
        blockers: [
          `Cannot merge: ${immutableMemories.length} memory(ies) marked as immutable`,
          `IDs: ${immutableMemories.map((m) => m.id).join(', ')}`,
        ],
      };
    }
  ),

  createBlockerCheck(
    'type_consistency',
    'Ensure all memories are same type',
    (memories) => {
      const types = new Set(memories.map((m) => m.type));
      if (types.size <= 1) {
        return { passed: true, blockers: [] };
      }
      return {
        passed: false,
        blockers: [
          `Cannot merge different types: ${Array.from(types).join(', ')}`,
          'All memories must be same type (fact, preference, decision, etc.)',
        ],
      };
    }
  ),

  createBlockerCheck(
    'already_merged',
    'Prevent re-merging of previously merged memories',
    (memories) => {
      const alreadyMerged = memories.filter((m) => m.isMerged);
      if (alreadyMerged.length === 0) {
        return { passed: true, blockers: [] };
      }
      return {
        passed: false,
        blockers: [
          `Cannot merge: ${alreadyMerged.length} memory(ies) already merged`,
          'Already-merged memories should not be re-merged. Undo previous merge first.',
        ],
      };
    }
  ),

  createBlockerCheck(
    'min_similarity',
    'Ensure similarity is above minimum threshold',
    (memories, metadata) => {
      const minThreshold = 0.70;
      if (!metadata || !('similarityScore' in metadata)) {
        return { passed: true, blockers: [] };
      }
      const similarity = metadata.similarityScore as number;
      if (similarity >= minThreshold) {
        return { passed: true, blockers: [] };
      }
      return {
        passed: false,
        blockers: [
          `Similarity too low: ${(similarity * 100).toFixed(1)}%`,
          `Minimum required: ${(minThreshold * 100).toFixed(0)}%`,
          'Increase similarity threshold or select more similar memories',
        ],
      };
    }
  ),

  createWarningCheck(
    'multi_user',
    'Warn about merging memories from different users',
    (memories) => {
      const users = new Set(memories.map((m) => m.userId).filter(Boolean));
      if (users.size <= 1) {
        return { warnings: [] };
      }
      return {
        warnings: [
          `Merging memories from ${users.size} different users`,
          'This is usually not recommended. Ensure you want to consolidate user-specific memories.',
        ],
      };
    }
  ),

  createWarningCheck(
    'privacy',
    'Warn about mixing private and non-private memories',
    (memories) => {
      const privacyStates = new Set(memories.map((m) => m.isPrivate));
      if (privacyStates.size <= 1) {
        return { warnings: [] };
      }
      return {
        warnings: [
          'Merging private and non-private memories',
          'The merged result will inherit the privacy setting of the canonical memory',
        ],
      };
    }
  ),

  createWarningCheck(
    'secrets',
    'Warn about merging memories with detected secrets',
    (memories) => {
      const withSecrets = memories.filter((m) => m.hasSecrets);
      if (withSecrets.length === 0) {
        return { warnings: [] };
      }
      return {
        warnings: [
          `${withSecrets.length} memory(ies) contain detected secrets`,
          'Ensure merged content does not expose sensitive information',
          'Consider redacting secrets before merging',
        ],
      };
    }
  ),

  createBlockerCheck(
    'active_status',
    'Ensure all memories are active',
    (memories) => {
      const inactive = memories.filter((m) => !m.isActive);
      if (inactive.length === 0) {
        return { passed: true, blockers: [] };
      }
      return {
        passed: false,
        blockers: [
          `Cannot merge: ${inactive.length} memory(ies) are inactive (archived/expired)`,
          'Only active memories can be merged',
        ],
      };
    }
  ),
];

export function runSafetyChecks(
  memories: Memory[],
  metadata?: Record<string, unknown>
): SafetyCheckResult {
  const results = SAFETY_CHECKS.map((check) => check.check(memories, metadata));

  const allBlockers = results.flatMap((r) => r.blockers);
  const allWarnings = results.flatMap((r) => r.warnings);

  return {
    passed: allBlockers.length === 0,
    warnings: allWarnings,
    blockers: allBlockers,
  };
}

export function checkBlockers(memories: Memory[]): boolean {
  const blockerChecks = SAFETY_CHECKS.filter((c) => c.type === 'blocker');

  for (const check of blockerChecks) {
    const result = check.check(memories);
    if (!result.passed) {
      return false;
    }
  }

  return true;
}

export function formatSafetyResults(result: SafetyCheckResult): string {
  if (result.passed && result.warnings.length === 0) {
    return 'All safety checks passed';
  }

  const lines: string[] = [];

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

export function describeSafetyChecks(): string {
  return SAFETY_CHECKS.map(
    (check) => `${check.name} [${check.type}]: ${check.description}`
  ).join('\n');
}
