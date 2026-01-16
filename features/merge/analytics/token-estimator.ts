/**
 * Token estimation for calculating context window savings from merges
 *
 * Uses a simple heuristic: 1 token ≈ 4 characters
 * (Can be upgraded to tiktoken library for exact counts)
 */

import type { Memory } from '../../../drizzle/schema.js';
import type { MergedMemory } from '../strategies/merge-strategies.js';
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq } from 'drizzle-orm';

/**
 * Simple token estimation heuristic
 * Based on OpenAI's approximation: 1 token ≈ 4 characters
 *
 * For more accurate counts, use tiktoken library:
 * const encoding = encoding_for_model("gpt-4");
 * const tokens = encoding.encode(text).length;
 */
function estimateTokensSimple(text: string): number {
  if (!text) return 0;
  // Rough heuristic: 1 token per 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Estimate metadata overhead per memory (field names, IDs, timestamps, etc.)
 */
function estimateMetadataOverhead(): number {
  // Approximate token cost for per-memory metadata:
  // - id: 2 tokens
  // - type: 1 token
  // - timestamps: 3 tokens
  // - tags: 2-5 tokens (varies)
  // - other fields: 5-10 tokens
  // Total: ~20-30 tokens per memory
  return 25;
}

/**
 * Estimate total tokens for a single memory including metadata
 */
function estimateMemoryTokens(memory: Memory): number {
  let tokens = 0;

  // Content
  tokens += estimateTokensSimple(memory.content);

  // Summary
  if (memory.summary) {
    tokens += estimateTokensSimple(memory.summary);
  }

  // Tags
  if (memory.tags && memory.tags.length > 0) {
    tokens += estimateTokensSimple(memory.tags.join(' '));
  }

  // Metadata JSON
  if (memory.metadata) {
    tokens += estimateTokensSimple(JSON.stringify(memory.metadata));
  }

  // Add overhead
  tokens += estimateMetadataOverhead();

  return tokens;
}

/**
 * Estimate total tokens for merged memory
 */
function estimateMergedMemoryTokens(merged: MergedMemory): number {
  let tokens = 0;

  // Content
  tokens += estimateTokensSimple(merged.content);

  // Summary
  if (merged.summary) {
    tokens += estimateTokensSimple(merged.summary);
  }

  // Tags
  if (merged.tags && merged.tags.length > 0) {
    tokens += estimateTokensSimple(merged.tags.join(' '));
  }

  // Metadata (typically larger due to provenance info)
  tokens += estimateTokensSimple(JSON.stringify(merged.metadata));

  // Add overhead
  tokens += estimateMetadataOverhead();

  return tokens;
}

/**
 * Calculate token savings for a specific merge
 *
 * Returns estimated number of tokens saved by merging source memories
 * into a single canonical memory
 */
export function estimateTokensSaved(sources: Memory[], merged: MergedMemory): number {
  // Calculate tokens for all sources
  const sourceTokens = sources.reduce((sum, memory) => sum + estimateMemoryTokens(memory), 0);

  // Calculate tokens for merged memory
  const mergedTokens = estimateMergedMemoryTokens(merged);

  // Savings is source - merged
  // (In practice, merged often includes provenance data, so savings may be modest)
  const savings = sourceTokens - mergedTokens;

  return Math.max(0, savings); // Never negative
}

/**
 * Calculate aggregate token savings for a project
 *
 * Sums up all token savings from completed merges
 */
export async function calculateProjectTokenSavings(
  projectId: string
): Promise<{
  totalSaved: number;
  mergeCount: number;
  avgSavingsPerMerge: number;
  tokenSavingPercentage: number;
  totalMemoryTokens: number;
}> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Get all memories in project
  const memories: Memory[] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId));

  // Calculate total tokens for all memories
  const totalMemoryTokens = memories.reduce((sum, m) => sum + estimateMemoryTokens(m), 0);

  // Get merge history
  if (!schema.memoryMergeHistory) {
    return {
      totalSaved: 0,
      mergeCount: 0,
      avgSavingsPerMerge: 0,
      tokenSavingPercentage: 0,
      totalMemoryTokens,
    };
  }

  const mergeHistory: any[] = await db
    .select()
    .from(schema.memoryMergeHistory)
    .where(eq(schema.memoryMergeHistory.projectId, projectId));

  // Sum up token savings
  const totalSaved = mergeHistory.reduce((sum, record) => sum + (record.tokensSaved || 0), 0);

  const mergeCount = mergeHistory.length;
  const avgSavingsPerMerge = mergeCount > 0 ? Math.round(totalSaved / mergeCount) : 0;
  const tokenSavingPercentage = totalMemoryTokens > 0 ? (totalSaved / totalMemoryTokens) * 100 : 0;

  return {
    totalSaved,
    mergeCount,
    avgSavingsPerMerge,
    tokenSavingPercentage,
    totalMemoryTokens,
  };
}

/**
 * Format token counts for display
 *
 * Converts token count to human-readable format with context usage
 */
export function formatTokenCount(tokens: number): string {
  // Show percentage of typical context window
  // Claude 3 / GPT-4: 128k tokens (~32k practical for context)
  const contextWindow = 128000;
  const typicalUseful = 32000;

  const percentage = (tokens / contextWindow) * 100;
  const usefulPercent = (tokens / typicalUseful) * 100;

  if (tokens < 1000) {
    return `${tokens} tokens (${percentage.toFixed(3)}% of context)`;
  }

  const kiloTokens = (tokens / 1000).toFixed(1);
  return `${kiloTokens}k tokens (${usefulPercent.toFixed(1)}% of typical recall window)`;
}

/**
 * Format savings report
 */
export function formatSavingsReport(savings: {
  totalSaved: number;
  mergeCount: number;
  avgSavingsPerMerge: number;
  tokenSavingPercentage: number;
  totalMemoryTokens: number;
}): string {
  const lines: string[] = [];

  lines.push('Memory Merge Savings Report');
  lines.push('='.repeat(40));

  if (savings.mergeCount === 0) {
    lines.push('No merges completed yet');
    return lines.join('\n');
  }

  lines.push(`Total Merges: ${savings.mergeCount}`);
  lines.push(`Total Tokens Saved: ${formatTokenCount(savings.totalSaved)}`);
  lines.push(`Avg Savings per Merge: ${formatTokenCount(savings.avgSavingsPerMerge)}`);
  lines.push(`Reduction: ${savings.tokenSavingPercentage.toFixed(2)}%`);
  lines.push(`Total Memory Tokens: ${formatTokenCount(savings.totalMemoryTokens)}`);

  return lines.join('\n');
}

/**
 * Estimate savings for a proposed merge (preview)
 *
 * Used in merge preview to show user estimated savings
 */
export function estimateMergeSavingsPreview(
  sources: Memory[],
  merged: MergedMemory
): { savedTokens: number; savedPercentage: number } {
  const sourceTokens = sources.reduce((sum, m) => sum + estimateMemoryTokens(m), 0);
  const mergedTokens = estimateMergedMemoryTokens(merged);
  const savedTokens = Math.max(0, sourceTokens - mergedTokens);
  const savedPercentage = sourceTokens > 0 ? (savedTokens / sourceTokens) * 100 : 0;

  return { savedTokens, savedPercentage };
}

/**
 * Get token statistics for a set of memories
 */
export function getTokenStatistics(memories: Memory[]): {
  total: number;
  min: number;
  max: number;
  average: number;
  median: number;
} {
  const counts = memories.map((m) => estimateMemoryTokens(m));
  const total = counts.reduce((a, b) => a + b, 0);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const average = Math.round(total / counts.length);

  // Calculate median
  const sorted = [...counts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    total,
    min,
    max,
    average,
    median: Math.round(median),
  };
}
