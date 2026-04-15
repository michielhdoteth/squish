/**
 * Memory Consolidation System
 * Implements experience replay and memory consolidation
 */

import { randomUUID } from 'crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { createDatabaseClient } from '../storage/database.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { getEmbedding } from '../../core/embeddings.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { getLowImportanceMemories } from './importance.js';
import { rememberMemory } from './memories.js';
import { logger } from '../logger.js';

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
 * Parse embedding from storage
 */
function parseEmbedding(embeddingData: any): number[] | null {
  if (!embeddingData) return null;

  if (Array.isArray(embeddingData)) return embeddingData;

  if (typeof embeddingData === 'string') {
    try {
      return JSON.parse(embeddingData);
    } catch {
      return null;
    }
  }

  if (Buffer.isBuffer(embeddingData)) {
    try {
      const floatArray = new Float32Array(embeddingData.buffer || embeddingData);
      return Array.from(floatArray);
    } catch {
      return null;
    }
  }

  return null;
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
 * Consolidate a cluster of memories into a single summary memory
 */
async function consolidateCluster(cluster: ClusterResult): Promise<ConsolidationResult> {
  const { memories } = cluster;
  const sourceMemoryIds = memories.map((m: any) => m.id);

  // Generate extractive summary
  const summary = generateExtractiveSummary(memories);

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
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  await db
    .update(schema.memories)
    .set({
      isConsolidated: 1,
      consolidatedInto: consolidated.id,
      consolidatedAt: new Date(),
    })
    .where(inArray(schema.memories.id, sourceMemoryIds));

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
 * Generate extractive summary from a cluster of memories
 * Uses text processing without requiring an LLM
 */
function generateExtractiveSummary(memories: any[]): string {
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
 * Truncate text to maximum length
 */
function truncate(text: string, maxLength: number): string {
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
