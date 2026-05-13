/**
 * Memory Consolidation System
 * Implements experience replay and memory consolidation with geometry-aware compression.
 *
 * Before consolidating a cluster, the system checks whether it's geometrically safe:
 * - Computes d_bar (mean within-cluster cosine distance)
 * - Computes d_eff (effective dimension via PCA eigenvalue ratio)
 * - If d_bar < theta_prime: consolidation is safe (cluster is tight)
 * - If d_bar >= theta_prime: cluster is too diverse, skip or split
 *
 * Falls back to extractive summary if geometry is disabled.
 */

import { randomUUID } from 'crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { config } from '../../config.js';
import { createDatabaseClient } from '../storage/database.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { getEmbedding } from '../../core/embeddings.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { getLowImportanceMemories } from './importance.js';
import { rememberMemory } from './memories.js';
import { logger } from '../logger.js';
import { callLLM } from '../llm/client.js';

// Geometry-aware consolidation imports
import {
  computeCentroid,
  computeMeanCosineDistance,
  estimateEffectiveDimension,
  compressionSafetyTest,
} from '../clustering/geometry.js';

export interface ConsolidationOptions {
  projectId: string;
  minAge?: number; // days - minimum age for consolidation
  maxImportance?: number; // 0-100 - maximum importance to consolidate
  minClusterSize?: number; // minimum memories in a cluster to consolidate
  similarityThreshold?: number; // 0-1 - minimum similarity to cluster
  limit?: number; // max memories to process
}

export interface ConsolidationResult {
  consolidatedMemoryId: string;
  sourceMemoryIds: string[];
  clusterSize: number;
  summary: string;
  geometrySafe?: boolean;  // Whether geometry check passed
  dBar?: number;           // Mean cosine distance (if geometry checked)
  dEff?: number;           // Effective dimension (if geometry checked)
}

export interface ClusterResult {
  memories: any[];
  similarity: number;
  representativeId: string;
}

/**
 * Main consolidation function - consolidates low-importance old memories
 */
export async function consolidateMemories(
  options: ConsolidationOptions
): Promise<ConsolidationResult[]> {
  const {
    projectId,
    minAge = 90,
    maxImportance = 30,
    minClusterSize = 3,
    similarityThreshold = 0.7,
    limit = 100,
  } = options;

  // Get low-importance, old memories
  const candidates = await getLowImportanceMemories(projectId, {
    minAge,
    maxImportance,
    limit,
  });

  if (candidates.length < minClusterSize) {
    logger.debug('Not enough memories to consolidate', {
      count: candidates.length,
      minClusterSize,
    });
    return [];
  }

  // Cluster memories by similarity
  const clusters = await clusterMemoriesBySimilarity(candidates, {
    minClusterSize,
    similarityThreshold,
  });

  logger.info(`Found ${clusters.length} memory clusters for consolidation`);

  const results: ConsolidationResult[] = [];

  // Consolidate each cluster
  for (const cluster of clusters) {
    try {
      const result = await consolidateCluster(cluster);
      results.push(result);
    } catch (error) {
      logger.error('Failed to consolidate cluster', error);
    }
  }

  return results;
}

/**
 * Cluster memories by similarity using a simple greedy algorithm
 */
async function clusterMemoriesBySimilarity(
  memories: any[],
  options: {
    minClusterSize?: number;
    similarityThreshold?: number;
  } = {}
): Promise<ClusterResult[]> {
  const { minClusterSize = 3, similarityThreshold = 0.7 } = options;

  const clustered = new Set<string>();
  const clusters: ClusterResult[] = [];

  for (const memory of memories) {
    if (clustered.has(memory.id)) continue;

    // Find similar memories
    const similar: any[] = [memory];
    const similarities: number[] = [1];

    for (const other of memories) {
      if (other.id === memory.id) continue;
      if (clustered.has(other.id)) continue;

      // Calculate similarity using embeddings
      const sim = await calculateMemorySimilarity(memory, other);
      if (sim >= similarityThreshold) {
        similar.push(other);
        similarities.push(sim);
        clustered.add(other.id);
      }
    }

    clustered.add(memory.id);

    // Only keep clusters that meet minimum size
    if (similar.length >= minClusterSize) {
      const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
      clusters.push({
        memories: similar as any,
        similarity: avgSimilarity,
        representativeId: memory.id,
      });
    }
  }

  return clusters;
}

/**
 * Calculate similarity between two memories using their embeddings
 */
async function calculateMemorySimilarity(
  memory1: any,
  memory2: any
): Promise<number> {
  let embedding1 = parseEmbedding(memory1.embedding) ?? parseEmbedding(memory1.embedding_json);
  let embedding2 = parseEmbedding(memory2.embedding) ?? parseEmbedding(memory2.embedding_json);

  if (!embedding1 || !embedding2) {
    // Fallback to text similarity if embeddings not available
    return textSimilarity(memory1.content, memory2.content);
  }

  return cosineSimilarity(embedding1, embedding2);
}

/**
 * Simple text similarity as fallback (Jaccard similarity of word sets)
 */
function textSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Extracts embedding vectors from cluster memories.
 * Returns null if no embeddings can be extracted.
 */
function extractClusterEmbeddings(memories: any[]): number[][] | null {
  const vectors: number[][] = [];
  for (const mem of memories) {
    const emb = parseEmbedding(mem.embedding) ?? parseEmbedding(mem.embedding_json);
    if (emb && emb.length > 0) {
      vectors.push(emb);
    }
  }
  return vectors.length >= 2 ? vectors : null;
}

/**
 * Finds the memory nearest to the centroid vector.
 * Used for geometry-safe consolidation (keep the closest real memory).
 */
function findNearestToCentroid(memories: any[], centroid: number[]): any {
  let bestMemory = memories[0];
  let bestSim = -1;

  for (const mem of memories) {
    const emb = parseEmbedding(mem.embedding) ?? parseEmbedding(mem.embedding_json);
    if (emb) {
      const sim = cosineSimilarity(emb, centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestMemory = mem;
      }
    }
  }

  return bestMemory;
}

/**
 * Consolidate a cluster of memories into a single summary memory.
 *
 * When geometry-aware consolidation is enabled:
 * 1. Extract embeddings from cluster memories
 * 2. Compute centroid, d_bar, and d_eff
 * 3. Run compression safety test
 * 4. If safe: use nearest memory to centroid as representative (conservative approach)
 * 5. If not safe: skip consolidation with log
 *
 * When geometry is disabled: falls back to extractive summary.
 */
async function consolidateCluster(cluster: ClusterResult): Promise<ConsolidationResult> {
  const { memories } = cluster;
  const sourceMemoryIds = memories.map((m: any) => m.id);

  // Check if geometry-aware consolidation is enabled
  if (config.consolidationGeometryEnabled) {
    const vectors = extractClusterEmbeddings(memories);

    if (vectors) {
      // Compute geometry
      const centroid = computeCentroid(vectors);
      const dBar = computeMeanCosineDistance(vectors, centroid);
      const dEff = estimateEffectiveDimension(vectors);
      const thetaPrime = config.consolidationGeometryThetaPrime;

      // Run compression safety test
      const safety = compressionSafetyTest(dBar, dEff, thetaPrime);

      if (safety.safe && config.consolidationGeometryAutoConsolidate) {
        // Safe to consolidate: use the nearest memory to centroid as representative
        const nearest = findNearestToCentroid(memories, centroid);
        const summary = `[Consolidated] ${nearest.content}`;

        // Create consolidated memory
        const consolidated = await rememberMemory({
          content: summary,
          type: 'context',
          metadata: {
            consolidatedFrom: sourceMemoryIds,
            consolidatedAt: new Date().toISOString(),
            clusterSize: memories.length,
            avgSimilarity: cluster.similarity,
            geometrySafe: true,
            dBar,
            dEff,
            thetaPrime,
            representativeId: nearest.id,
          },
          tags: ['consolidated', 'geometry-safe'],
        });

        // Mark originals as consolidated
        await markConsolidated(consolidated.id, sourceMemoryIds);

        logger.info('Geometry-safe consolidation', {
          consolidatedId: consolidated.id,
          sourceCount: memories.length,
          dBar: dBar.toFixed(4),
          dEff: dEff.toFixed(2),
        });

        return {
          consolidatedMemoryId: consolidated.id,
          sourceMemoryIds,
          clusterSize: memories.length,
          summary,
          geometrySafe: true,
          dBar,
          dEff,
        };
      } else if (!safety.safe) {
        // Unsafe to consolidate: log and skip
        logger.info(`Skipping consolidation for cluster of ${memories.length} memories: ${safety.reason}`, {
          clusterId: cluster.representativeId,
          dBar: dBar.toFixed(4),
          dEff: dEff.toFixed(2),
          thetaPrime,
        });

        // If auto-split is enabled, log that splitting could help
        if (config.consolidationGeometryAutoSplit) {
          logger.debug(`Cluster (rep=${cluster.representativeId}) is candidate for splitting ` +
            `(d_eff=${dEff.toFixed(2)}, n=${memories.length})`);
        }

        // Return a "skipped" result
        return {
          consolidatedMemoryId: '',
          sourceMemoryIds,
          clusterSize: memories.length,
          summary: `[Skipped] cluster too diverse: d_bar=${dBar.toFixed(4)} >= ${thetaPrime}`,
          geometrySafe: false,
          dBar,
          dEff,
        };
      }
      // If autoConsolidate is disabled, fall through to old behavior
    }
  }

  // Fall back to extractive or LLM summary (geometry disabled or no embeddings)
  const summary = await generateClusterSummary(memories);

  // Create consolidated memory
  const consolidated = await rememberMemory({
    content: summary,
    type: 'context',
    metadata: {
      consolidatedFrom: sourceMemoryIds,
      consolidatedAt: new Date().toISOString(),
      clusterSize: memories.length,
      avgSimilarity: cluster.similarity,
    },
    tags: ['consolidated'],
  });

  // Mark originals as consolidated
  await markConsolidated(consolidated.id, sourceMemoryIds);

  logger.info('Consolidated memory cluster', {
    consolidatedId: consolidated.id,
    sourceCount: memories.length,
    sourceIds: sourceMemoryIds,
  });

  return {
    consolidatedMemoryId: consolidated.id,
    sourceMemoryIds,
    clusterSize: memories.length,
    summary,
  };
}

/**
 * Mark memories as consolidated in the database.
 */
async function markConsolidated(
  consolidatedId: string,
  sourceMemoryIds: string[]
): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  await db
    .update(schema.memories)
    .set({
      isConsolidated: 1,
      consolidatedInto: consolidatedId,
      consolidatedAt: new Date(),
    })
    .where(inArray(schema.memories.id, sourceMemoryIds));
}

/**
 * Generate extractive summary from a cluster of memories
 * Uses text processing without requiring an LLM
 * Exported for testing; used internally by generateClusterSummary().
 */
export function generateExtractiveSummary(memories: any[]): string {
  // Group by memory type
  const byType = new Map<string, any[]>();
  for (const m of memories) {
    const type = m.type ?? 'observation';
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(m);
  }

  const summaryParts: string[] = [];

  // Add header with count
  summaryParts.push(`Consolidated from ${memories.length} memories:`);

  // Summarize each type
  for (const [type, typeMemories] of byType.entries()) {
    if (typeMemories.length === 1) {
      summaryParts.push(`\n- ${type}: ${truncate(typeMemories[0].content, 100)}`);
    } else {
      summaryParts.push(`\n- ${type}s (${typeMemories.length}):`);
      // Extract key phrases from each memory
      for (const m of typeMemories.slice(0, 3)) {
        summaryParts.push(`  - ${truncate(m.content, 80)}`);
      }
      if (typeMemories.length > 3) {
        summaryParts.push(`  - ...and ${typeMemories.length - 3} more`);
      }
    }
  }

  return summaryParts.join('\n');
}

/**
 * Generate a cluster summary.
 * Uses LLM when available and enabled, falls back to extractive summary.
 * LLM is always optional - never blocks, never throws.
 * Exported for testing; use consolidateCluster() for production.
 */
export async function generateClusterSummary(memories: any[]): Promise<string> {
  const LIMIT = 20; // Limit memories to prevent prompt overflow

  // Try LLM if enabled and we have enough content
  if (config.llmEnabled && memories.length >= 2) {
    try {
      // Slice memories to avoid excessive prompt size
      const slice = memories.slice(0, LIMIT);
      const memTexts = slice
        .map((m, i) => `[${i + 1}] ${truncate(m.content, 500)}`)
        .join('\n\n');

      const prompt = `Summarize these related memories into a single coherent summary that captures the key information:

${memTexts}

Summary:`;

      const llmResult = await callLLM(prompt);
      if (llmResult && llmResult.length > 0) {
        logger.debug('Generated LLM cluster summary', {
          memoryCount: memories.length,
          summaryLength: llmResult.length,
        });
        return llmResult;
      }
    } catch {
      // LLM failed silently - fall through to extractive summary
      logger.debug('LLM cluster summary failed, falling back to extractive');
    }
  }

  // Fallback: extractive summary (always works)
  return generateExtractiveSummary(memories);
}

/**
 * Truncate text to maximum length
 * Exported for testing.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Reverse consolidation - restore original memories
 * This allows undoing consolidation if needed
 */
export async function reverseConsolidation(
  consolidatedMemoryId: string
): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Get the consolidated memory
  const consolidated = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, consolidatedMemoryId))
    .limit(1);

  if (consolidated.length === 0) {
    throw new Error(`Consolidated memory not found: ${consolidatedMemoryId}`);
  }

  const metadata = consolidated[0].metadata as any;
  const sourceIds = metadata?.consolidatedFrom as string[] | undefined;

  if (!sourceIds || sourceIds.length === 0) {
    throw new Error('No source memories found in consolidated memory metadata');
  }

  // Restore original memories
  await db
    .update(schema.memories)
    .set({
      isConsolidated: 0,
      consolidatedInto: null,
      consolidatedAt: null,
    })
    .where(inArray(schema.memories.id, sourceIds));

  // Delete the consolidated memory
  await db
    .delete(schema.memories)
    .where(eq(schema.memories.id, consolidatedMemoryId));

  logger.info('Reversed consolidation', {
    consolidatedId: consolidatedMemoryId,
    restoredCount: sourceIds.length,
  });
}

/**
 * Get consolidation statistics for a project
 */
export async function getConsolidationStats(
  projectId: string
): Promise<{
  totalMemories: number;
  consolidatedMemories: number;
  consolidationsCreated: number;
  avgClusterSize: number;
}> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Get all memories for project
  const memories = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  const totalMemories = memories.length;
  const consolidatedMemories = memories.filter((m: any) => m.isConsolidated).length;

  // Get consolidation summaries (memories created by consolidation)
  const consolidations = memories.filter((m: any) => {
    const metadata = m.metadata as any;
    return metadata?.consolidatedFrom && Array.isArray(metadata.consolidatedFrom);
  });

  const consolidationsCreated = consolidations.length;

  // Calculate average cluster size
  let totalClusterSize = 0;
  for (const m of consolidations) {
    const metadata = m.metadata as any;
    totalClusterSize += metadata?.clusterSize || 0;
  }
  const avgClusterSize = consolidationsCreated > 0
    ? totalClusterSize / consolidationsCreated
    : 0;

  return {
    totalMemories,
    consolidatedMemories,
    consolidationsCreated,
    avgClusterSize,
  };
}
