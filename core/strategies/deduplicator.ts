import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import type { Strategy, CreateStrategyInput } from './types.js';
import { supersedeStrategy, listStrategies, getStrategy } from './store.js';

/**
 * Compute Jaccard similarity between two sets of words.
 * Jaccard(A, B) = |intersection(A, B)| / |union(A, B)|
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set<string>();
  for (const item of setA) {
    if (setB.has(item)) intersection.add(item);
  }
  const union = new Set<string>(setA);
  for (const item of setB) {
    union.add(item);
  }
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Tokenize a string into a set of lowercase words.
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Compute text similarity between two strategies based on title + description.
 */
function computeSimilarity(a: { title: string; description: string }, b: { title: string; description: string }): number {
  const wordsA = tokenize(`${a.title} ${a.description}`);
  const wordsB = tokenize(`${b.title} ${b.description}`);
  return jaccardSimilarity(wordsA, wordsB);
}

/**
 * Find similar strategies to a given input using text similarity.
 * Returns strategies with similarity scores above 0.3.
 */
export async function findSimilarStrategies(
  strategy: CreateStrategyInput,
  projectId?: string,
): Promise<Array<Strategy & { similarity: number }>> {
  const existing = await listStrategies({
    projectId,
    strategyType: strategy.strategyType,
    status: 'active',
    limit: 100,
  });

  const results: Array<Strategy & { similarity: number }> = [];

  for (const candidate of existing) {
    const similarity = computeSimilarity(
      { title: strategy.title, description: strategy.description },
      { title: candidate.title, description: candidate.description },
    );

    if (similarity > 0.3) {
      results.push({ ...candidate, similarity });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Merge multiple strategies into one. The kept strategy absorbs the others,
 * which are superseded.
 */
export async function mergeStrategies(
  strategyIds: string[],
  keepId: string,
): Promise<void> {
  const keepStrategy = await getStrategy(keepId);
  if (!keepStrategy) {
    throw new Error(`Keep strategy not found: ${keepId}`);
  }

  // Merge tags from all strategies
  const allTags = new Set<string>();
  const allSteps: string[] = [];
  let totalUsage = 0;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (const id of strategyIds) {
    if (id === keepId) continue;

    const strategy = await getStrategy(id);
    if (!strategy) continue;

    // Parse and merge tags
    if (strategy.tags) {
      try {
        const tags: string[] = JSON.parse(strategy.tags);
        for (const tag of tags) allTags.add(tag);
      } catch { /* ignore malformed tags */ }
    }

    // Parse and merge steps
    if (strategy.steps) {
      try {
        const steps: string[] = JSON.parse(strategy.steps);
        allSteps.push(...steps);
      } catch { /* ignore malformed steps */ }
    }

    // Aggregate usage stats
    totalUsage += strategy.usageCount;
    totalSuccess += strategy.successCount;
    totalFailure += strategy.failureCount;

    // Supersede the old strategy
    await supersedeStrategy(id, keepId, 'merged into ' + keepId);
  }

  // Also parse keep strategy's existing tags and steps
  if (keepStrategy.tags) {
    try {
      const tags: string[] = JSON.parse(keepStrategy.tags);
      for (const tag of tags) allTags.add(tag);
    } catch { /* ignore */ }
  }

  if (keepStrategy.steps) {
    try {
      const steps: string[] = JSON.parse(keepStrategy.steps);
      allSteps.push(...steps);
    } catch { /* ignore */ }
  }

  // Deduplicate steps
  const uniqueSteps = [...new Set(allSteps)];

  // Update the kept strategy with merged data
  const { updateStrategy } = await import('./store.js');
  await updateStrategy(keepId, {
    tags: JSON.stringify([...allTags]),
    steps: uniqueSteps.length > 0 ? JSON.stringify(uniqueSteps) : null,
    usageCount: keepStrategy.usageCount + totalUsage,
    successCount: keepStrategy.successCount + totalSuccess,
    failureCount: keepStrategy.failureCount + totalFailure,
  });

  logger.info('Strategies merged', { keepId, merged: strategyIds.filter((id) => id !== keepId) });
}

/**
 * Batch deduplicate strategies within a project.
 * Finds groups of similar strategies (similarity > 0.5) and merges them,
 * keeping the one with the highest confidence.
 */
export async function deduplicateStrategies(
  projectId: string,
): Promise<{ merged: number; kept: string[] }> {
  const strategies = await listStrategies({
    projectId,
    status: 'active',
    limit: 500,
  });

  const processed = new Set<string>();
  const kept: string[] = [];
  let merged = 0;

  for (let i = 0; i < strategies.length; i++) {
    const a = strategies[i];
    if (processed.has(a.id)) continue;

    // Find all strategies similar to this one
    const similar: string[] = [];
    for (let j = i + 1; j < strategies.length; j++) {
      const b = strategies[j];
      if (processed.has(b.id)) continue;

      const similarity = computeSimilarity(
        { title: a.title, description: a.description },
        { title: b.title, description: b.description },
      );

      if (similarity > 0.5) {
        similar.push(b.id);
      }
    }

    if (similar.length > 0) {
      // Find the strategy with highest confidence among the group
      const group = [a, ...strategies.filter((s) => similar.includes(s.id))];
      const best = group.reduce((prev, curr) =>
        (curr.confidence > prev.confidence) ? curr : prev
      );

      // Merge all others into the best
      const toMerge = group.filter((s) => s.id !== best.id).map((s) => s.id);
      if (toMerge.length > 0) {
        await mergeStrategies([best.id, ...toMerge], best.id);
        merged += toMerge.length;
      }

      kept.push(best.id);
      processed.add(a.id);
      for (const id of similar) processed.add(id);
    } else {
      kept.push(a.id);
      processed.add(a.id);
    }
  }

  logger.info('Deduplication complete', { projectId, merged, kept: kept.length });
  return { merged, kept };
}
