/**
 * Type-specific merge strategies for different memory types
 *
 * Each memory type (fact, preference, decision, observation, context)
 * has different merge semantics to preserve meaning and prevent data loss.
 */
// ============================================================================
// FACT Merging Strategy
// ============================================================================
/**
 * FACTS: Union of information, preserve all unique facts
 *
 * Examples:
 * - "User prefers dark mode" + "User uses VSCode" → Both preserved
 * - "Function takes 3 params" + "Function takes 3 params" → Deduplicate
 *
 * Semantics:
 * - Combine all facts into unified statement
 * - Remove exact duplicate sentences
 * - Add provenance (timestamps, sources)
 * - Union of tags
 */
class FactMergeStrategy {
    type = 'fact';
    canMerge(sources) {
        // Facts can almost always be merged
        if (sources.length < 2) {
            return { ok: false, reason: 'Need at least 2 memories to merge' };
        }
        return { ok: true };
    }
    merge(sources) {
        if (sources.length === 0) {
            return {
                content: '',
                summary: null,
                tags: [],
                metadata: {},
                mergeReason: 'Empty source set',
                conflictWarnings: [],
            };
        }
        // Split content into sentences and deduplicate
        const sentenceSet = new Set();
        const timestamps = [];
        for (const source of sources) {
            // Extract sentences (split by period, exclamation, question)
            const sentences = source.content
                .split(/[.!?]\s+/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            for (const sentence of sentences) {
                sentenceSet.add(sentence);
            }
            if (source.createdAt) {
                timestamps.push(source.createdAt);
            }
        }
        // Sort sentences for consistency
        const mergedSentences = Array.from(sentenceSet).sort();
        const content = mergedSentences.join('. ') + (mergedSentences.length > 0 ? '.' : '');
        // Merge tags (union)
        const tagSet = new Set();
        for (const source of sources) {
            for (const tag of source.tags || []) {
                tagSet.add(tag);
            }
        }
        // Create merged metadata with provenance
        const metadata = {
            mergedFrom: sources.map((m) => ({
                id: m.id,
                createdAt: m.createdAt,
                source: m.source,
            })),
            mergeCount: sources.length,
            timestamps: timestamps.sort(),
        };
        return {
            content,
            summary: null,
            tags: Array.from(tagSet),
            metadata,
            mergeReason: `Merged ${sources.length} facts by combining all unique statements`,
            conflictWarnings: [],
        };
    }
}
// ============================================================================
// PREFERENCE Merging Strategy
// ============================================================================
/**
 * PREFERENCES: Keep latest preference, note evolution
 *
 * Examples:
 * - "Prefers tabs" (2023) + "Prefers spaces" (2024) → Keep 2024 version, note change
 * - "Uses VSCode" + "Uses VSCode" → Deduplicate
 *
 * Semantics:
 * - Latest preference wins (by createdAt timestamp)
 * - Record evolution in metadata (preference history)
 * - Warn if preferences conflict
 * - Can indicate user changed their mind
 */
class PreferenceMergeStrategy {
    type = 'preference';
    canMerge(sources) {
        if (sources.length < 2) {
            return { ok: false, reason: 'Need at least 2 memories to merge' };
        }
        return { ok: true };
    }
    merge(sources) {
        if (sources.length === 0) {
            return {
                content: '',
                summary: null,
                tags: [],
                metadata: {},
                mergeReason: 'Empty source set',
                conflictWarnings: [],
            };
        }
        // Sort by creation date (newest first)
        const sorted = [...sources].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const latest = sorted[0];
        const warnings = [];
        // Check for conflicting preferences
        const uniqueContents = new Set(sources.map((m) => m.content));
        if (uniqueContents.size > 1) {
            warnings.push(`Multiple preferences detected: ${Array.from(uniqueContents).join(', ')}`);
            warnings.push(`Using latest preference from ${latest.createdAt || 'unknown date'}`);
        }
        // Build history timeline
        const history = sorted.map((m) => ({
            preference: m.content,
            createdAt: m.createdAt,
            confidence: m.confidence || 100,
            source: m.source,
        }));
        const metadata = {
            mergedFrom: sources.map((m) => m.id),
            preferenceHistory: history,
            mergeCount: sources.length,
            latestAt: latest.createdAt,
        };
        const summary = sources.length > 1
            ? `Prefers: ${latest.content} (evolved from ${sources.length} preferences)`
            : null;
        return {
            content: latest.content,
            summary,
            tags: latest.tags || [],
            metadata,
            mergeReason: `Merged ${sources.length} preference records, keeping latest from ${latest.createdAt}`,
            conflictWarnings: warnings,
        };
    }
}
// ============================================================================
// DECISION Merging Strategy
// ============================================================================
/**
 * DECISIONS: Latest decision wins, link to previous decisions
 *
 * Examples:
 * - "Use React" (2023) + "Use Vue" (2024) → Keep 2024, link to previous
 * - "Use TypeScript" + "Use TypeScript" → Deduplicate
 *
 * Semantics:
 * - Most recent decision is the current choice
 * - Record all previous decisions (decision timeline)
 * - Warn if decisions contradict
 * - Include rationale changes
 */
class DecisionMergeStrategy {
    type = 'decision';
    canMerge(sources) {
        if (sources.length < 2) {
            return { ok: false, reason: 'Need at least 2 memories to merge' };
        }
        return { ok: true };
    }
    merge(sources) {
        if (sources.length === 0) {
            return {
                content: '',
                summary: null,
                tags: [],
                metadata: {},
                mergeReason: 'Empty source set',
                conflictWarnings: [],
            };
        }
        // Sort by creation date (newest first)
        const sorted = [...sources].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const latest = sorted[0];
        const warnings = [];
        // Check for conflicting decisions
        const uniqueDecisions = new Set(sources.map((m) => m.content));
        if (uniqueDecisions.size > 1) {
            warnings.push(`Decision changed: was ${sorted[sorted.length - 1].content}, now ${latest.content}`);
        }
        // Build decision timeline
        const timeline = sorted.map((m) => ({
            decision: m.content,
            createdAt: m.createdAt,
            confidence: m.confidence || 100,
            rationale: m.summary || 'No rationale recorded',
        }));
        const metadata = {
            mergedFrom: sources.map((m) => m.id),
            decisionTimeline: timeline,
            mergeCount: sources.length,
            currentDecisionAt: latest.createdAt,
            supersedes: sorted.slice(1).map((m) => m.id),
        };
        const summary = sources.length > 1 ? `Decided: ${latest.content} (${sources.length} decisions)` : null;
        return {
            content: latest.content,
            summary,
            tags: latest.tags || [],
            metadata,
            mergeReason: `Merged ${sources.length} decision records, keeping latest from ${latest.createdAt}`,
            conflictWarnings: warnings,
        };
    }
}
// ============================================================================
// OBSERVATION Merging Strategy
// ============================================================================
/**
 * OBSERVATIONS: Aggregate observations while preserving temporal order
 *
 * Examples:
 * - "Code review took 2h" + "Code review took 3h" → "Code reviews take 2-3 hours"
 * - "Fixed bug in parser" + "Fixed bug in lexer" → List both fixes
 *
 * Semantics:
 * - Aggregate similar observations (ranges, statistics)
 * - Preserve temporal patterns
 * - Note frequency of observations
 */
class ObservationMergeStrategy {
    type = 'observation';
    canMerge(sources) {
        if (sources.length < 2) {
            return { ok: false, reason: 'Need at least 2 memories to merge' };
        }
        return { ok: true };
    }
    merge(sources) {
        if (sources.length === 0) {
            return {
                content: '',
                summary: null,
                tags: [],
                metadata: {},
                mergeReason: 'Empty source set',
                conflictWarnings: [],
            };
        }
        // Sort chronologically
        const sorted = [...sources].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        // Create observation summary
        const observations = sorted.map((m) => `• ${m.content}`).join('\n');
        const metadata = {
            mergedFrom: sources.map((m) => m.id),
            observationCount: sources.length,
            timeSpan: {
                start: sorted[0].createdAt,
                end: sorted[sorted.length - 1].createdAt,
            },
            chronologicalOrder: sorted.map((m) => ({
                id: m.id,
                content: m.content,
                createdAt: m.createdAt,
            })),
        };
        // Merge tags
        const tagSet = new Set();
        for (const source of sources) {
            for (const tag of source.tags || []) {
                tagSet.add(tag);
            }
        }
        return {
            content: `Observations (${sources.length} total):\n${observations}`,
            summary: `${sources.length} observations over time period`,
            tags: Array.from(tagSet),
            metadata,
            mergeReason: `Merged ${sources.length} observations chronologically`,
            conflictWarnings: [],
        };
    }
}
// ============================================================================
// CONTEXT Merging Strategy
// ============================================================================
/**
 * CONTEXT: Union of context, remove exact duplicates
 *
 * Examples:
 * - "Project uses TypeScript" + "Project uses TypeScript" → Deduplicate
 * - "Uses async/await" + "Uses Promises" → Keep both (different details)
 *
 * Semantics:
 * - Preserve all unique context information
 * - Remove exact duplicates
 * - Combine related context
 */
class ContextMergeStrategy {
    type = 'context';
    canMerge(sources) {
        if (sources.length < 2) {
            return { ok: false, reason: 'Need at least 2 memories to merge' };
        }
        return { ok: true };
    }
    merge(sources) {
        if (sources.length === 0) {
            return {
                content: '',
                summary: null,
                tags: [],
                metadata: {},
                mergeReason: 'Empty source set',
                conflictWarnings: [],
            };
        }
        // Deduplicate by content (exact matches)
        const uniqueContexts = new Map();
        for (const source of sources) {
            if (!uniqueContexts.has(source.content)) {
                uniqueContexts.set(source.content, source);
            }
        }
        // Format as list
        const contextList = Array.from(uniqueContexts.keys())
            .sort()
            .map((content) => `• ${content}`)
            .join('\n');
        const metadata = {
            mergedFrom: sources.map((m) => m.id),
            uniqueContextCount: uniqueContexts.size,
            totalContextCount: sources.length,
            deduplicatedEntries: sources.length - uniqueContexts.size,
        };
        // Merge tags
        const tagSet = new Set();
        for (const source of sources) {
            for (const tag of source.tags || []) {
                tagSet.add(tag);
            }
        }
        return {
            content: contextList,
            summary: `${uniqueContexts.size} context items (${sources.length} total)`,
            tags: Array.from(tagSet),
            metadata,
            mergeReason: `Merged ${sources.length} context records into ${uniqueContexts.size} unique items`,
            conflictWarnings: [],
        };
    }
}
// ============================================================================
// Strategy Registry
// ============================================================================
export const MERGE_STRATEGIES = {
    fact: new FactMergeStrategy(),
    preference: new PreferenceMergeStrategy(),
    decision: new DecisionMergeStrategy(),
    observation: new ObservationMergeStrategy(),
    context: new ContextMergeStrategy(),
};
/**
 * Get the appropriate merge strategy for a memory type
 */
export function getMergeStrategy(type) {
    const strategy = MERGE_STRATEGIES[type];
    if (!strategy) {
        throw new Error(`No merge strategy defined for type: ${type}`);
    }
    return strategy;
}
/**
 * Merge a set of memories using their type-specific strategy
 */
export function mergeMemories(sources) {
    if (sources.length === 0) {
        throw new Error('Cannot merge: no source memories');
    }
    // All sources must be same type
    const type = sources[0].type;
    const allSameType = sources.every((m) => m.type === type);
    if (!allSameType) {
        throw new Error('Cannot merge: memories must be same type');
    }
    const strategy = getMergeStrategy(type);
    const canMerge = strategy.canMerge(sources);
    if (!canMerge.ok) {
        throw new Error(`Cannot merge: ${canMerge.reason}`);
    }
    return strategy.merge(sources);
}
//# sourceMappingURL=merge-strategies.js.map