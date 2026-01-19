/**
 * Type-specific merge strategies for different memory types.
 * Each type has different merge semantics to preserve meaning and prevent data loss.
 */

import type { Memory, MemoryType } from '../../../drizzle/schema.js';

export interface MergeStrategy {
  type: MemoryType;
  /**
   * Merge a set of source memories into a single canonical memory
   */
  merge(sources: Memory[]): MergedMemory;
  /**
   * Check if memories can be safely merged
   * Returns { ok, reason } where reason explains why merging is not allowed
   */
  canMerge(sources: Memory[]): { ok: boolean; reason?: string };
}

export interface MergedMemory {
  content: string;
  summary: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  mergeReason: string;
  conflictWarnings: string[];
}

/**
 * FACT strategy: Union of information, remove exact duplicates.
 * Combines all unique facts into a unified statement with provenance tracking.
 */
class FactMergeStrategy implements MergeStrategy {
  type: MemoryType = 'fact';

  canMerge(sources: Memory[]): { ok: boolean; reason?: string } {
    // Facts can almost always be merged
    if (sources.length < 2) {
      return { ok: false, reason: 'Need at least 2 memories to merge' };
    }
    return { ok: true };
  }

  merge(sources: Memory[]): MergedMemory {
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
    const sentenceSet = new Set<string>();
    const timestamps: string[] = [];

    for (const source of sources) {
      // Extract sentences (split by period, exclamation, question)
      const sentences = source.content
        .split(/[.!?]\s+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

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
    const tagSet = new Set<string>();
    for (const source of sources) {
      for (const tag of source.tags || []) {
        tagSet.add(tag);
      }
    }

    // Create merged metadata with provenance
    const metadata: Record<string, unknown> = {
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

/**
 * PREFERENCE strategy: Keep latest by timestamp, track evolution history.
 * Warns if preferences conflict, indicating user changed their mind.
 */
class PreferenceMergeStrategy implements MergeStrategy {
  type: MemoryType = 'preference';

  canMerge(sources: Memory[]): { ok: boolean; reason?: string } {
    if (sources.length < 2) {
      return { ok: false, reason: 'Need at least 2 memories to merge' };
    }
    return { ok: true };
  }

  merge(sources: Memory[]): MergedMemory {
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
    const sorted = [...sources].sort(
      (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );

    const latest = sorted[0];
    const warnings: string[] = [];

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

    const metadata: Record<string, unknown> = {
      mergedFrom: sources.map((m) => m.id),
      preferenceHistory: history,
      mergeCount: sources.length,
      latestAt: latest.createdAt,
    };

    const summary =
      sources.length > 1
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

/**
 * DECISION strategy: Keep latest decision, link to previous ones in timeline.
 * Warns if decisions contradict, preserving rationale history.
 */
class DecisionMergeStrategy implements MergeStrategy {
  type: MemoryType = 'decision';

  canMerge(sources: Memory[]): { ok: boolean; reason?: string } {
    if (sources.length < 2) {
      return { ok: false, reason: 'Need at least 2 memories to merge' };
    }
    return { ok: true };
  }

  merge(sources: Memory[]): MergedMemory {
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
    const sorted = [...sources].sort(
      (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );

    const latest = sorted[0];
    const warnings: string[] = [];

    // Check for conflicting decisions
    const uniqueDecisions = new Set(sources.map((m) => m.content));
    if (uniqueDecisions.size > 1) {
      warnings.push(
        `Decision changed: was ${sorted[sorted.length - 1].content}, now ${latest.content}`
      );
    }

    // Build decision timeline
    const timeline = sorted.map((m) => ({
      decision: m.content,
      createdAt: m.createdAt,
      confidence: m.confidence || 100,
      rationale: m.summary || 'No rationale recorded',
    }));

    const metadata: Record<string, unknown> = {
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

/**
 * OBSERVATION strategy: Aggregate observations in chronological order.
 * Preserves temporal patterns and frequency information.
 */
class ObservationMergeStrategy implements MergeStrategy {
  type: MemoryType = 'observation';

  canMerge(sources: Memory[]): { ok: boolean; reason?: string } {
    if (sources.length < 2) {
      return { ok: false, reason: 'Need at least 2 memories to merge' };
    }
    return { ok: true };
  }

  merge(sources: Memory[]): MergedMemory {
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
    const sorted = [...sources].sort(
      (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
    );

    // Create observation summary
    const observations = sorted.map((m) => `• ${m.content}`).join('\n');

    const metadata: Record<string, unknown> = {
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
    const tagSet = new Set<string>();
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

/**
 * CONTEXT strategy: Union of unique context, remove exact duplicates.
 * Preserves all distinct context items.
 */
class ContextMergeStrategy implements MergeStrategy {
  type: MemoryType = 'context';

  canMerge(sources: Memory[]): { ok: boolean; reason?: string } {
    if (sources.length < 2) {
      return { ok: false, reason: 'Need at least 2 memories to merge' };
    }
    return { ok: true };
  }

  merge(sources: Memory[]): MergedMemory {
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
    const uniqueContexts = new Map<string, Memory>();
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

    const metadata: Record<string, unknown> = {
      mergedFrom: sources.map((m) => m.id),
      uniqueContextCount: uniqueContexts.size,
      totalContextCount: sources.length,
      deduplicatedEntries: sources.length - uniqueContexts.size,
    };

    // Merge tags
    const tagSet = new Set<string>();
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

export const MERGE_STRATEGIES: Record<MemoryType, MergeStrategy> = {
  fact: new FactMergeStrategy(),
  preference: new PreferenceMergeStrategy(),
  decision: new DecisionMergeStrategy(),
  observation: new ObservationMergeStrategy(),
  context: new ContextMergeStrategy(),
};

export function getMergeStrategy(type: MemoryType): MergeStrategy {
  const strategy = MERGE_STRATEGIES[type];
  if (!strategy) {
    throw new Error(`No merge strategy defined for type: ${type}`);
  }
  return strategy;
}

export function mergeMemories(sources: Memory[]): MergedMemory {
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
