/**
 * Consolidation Engine with Sleep Cycles
 * Implements dual-store (episodic buffer -> semantic graph) with periodic replay
 */

import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { parseEmbedding } from '../lib/parse-embedding.js';

export interface ConsolidationConfig {
  enabled: boolean;
  sleepIntervalHours: number;  // Default: 24 (daily)
  minClusterSize: number;      // Default: 3
  maxClusterSize: number;      // Default: 20
  similarityThreshold: number;  // Default: 0.8
  mergeConfidence: number;     // Default: 0.85
}

export const DEFAULT_CONFIG: ConsolidationConfig = {
  enabled: true,
  sleepIntervalHours: 24,
  minClusterSize: 3,
  maxClusterSize: 20,
  similarityThreshold: 0.8,
  mergeConfidence: 0.85
};

/**
 * Run consolidation sleep cycle
 * 1. Cluster related memories (DBSCAN-like algorithm)
 * 2. Extract patterns from clusters
 * 3. Merge redundant memories
 * 4. Promote key facts to semantic layer
 */
export async function runSleepCycle(
  projectId?: string,
  config?: Partial<ConsolidationConfig>
): Promise<{
  clusters: number;
  merged: number;
  promoted: number;
  errors: string[];
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const stats = { clusters: 0, merged: 0, promoted: 0, errors: [] as string[] };

  if (!cfg.enabled) {
    logger.info('Consolidation: disabled');
    return stats;
  }

  try {
    logger.info('Consolidation: Starting sleep cycle...');

    // 1. Fetch recent episodic memories
    const memories = await fetchEpisodicMemories(projectId);
    logger.info(`Consolidation: Processing ${memories.length} memories`);

    if (memories.length === 0) {
      logger.info('Consolidation: No episodic memories to process');
      return stats;
    }

    // 2. Cluster using DBSCAN (density-based)
    const clusters = dbscanCluster(memories, cfg.similarityThreshold, cfg.minClusterSize);
    stats.clusters = clusters.length;
    logger.info(`Consolidation: Found ${clusters.length} clusters`);

    // 3. Process each cluster
    for (const cluster of clusters) {
      try {
        // Extract pattern/summary
        const pattern = extractPattern(cluster);

        // Merge redundant memories
        const mergeResult = await mergeRedundant(cluster, cfg.mergeConfidence);
        stats.merged += mergeResult.mergedCount;

        // Promote to semantic layer if strong pattern
        if (pattern.confidence >= cfg.mergeConfidence) {
          await promoteToSemantic(pattern, cluster[0].projectId);
          stats.promoted++;
        }
      } catch (e: any) {
        const errorMsg = `Cluster processing: ${e.message || String(e)}`;
        stats.errors.push(errorMsg);
        logger.error(errorMsg, e);
      }
    }

    logger.info(`Consolidation: Complete. Clusters=${stats.clusters}, Merged=${stats.merged}, Promoted=${stats.promoted}`);
  } catch (e: any) {
    const errorMsg = `Sleep cycle failed: ${e.message || String(e)}`;
    stats.errors.push(errorMsg);
    logger.error('Consolidation error:', e);
  }

  return stats;
}

/**
 * DBSCAN clustering on memories
 * (Simplified version - uses tag similarity)
 */
export function dbscanCluster(
  memories: any[],
  eps: number = 0.8,
  minPts: number = 3
): any[][] {
  const clusters: any[][] = [];
  const visited = new Set<string>();

  if (memories.length === 0) {
    return clusters;
  }

  for (const memory of memories) {
    if (!memory || !memory.id) continue;
    if (visited.has(memory.id)) continue;

    visited.add(memory.id);

    // Find neighbors (memories with similarity > eps)
    const neighbors = findNeighbors(memory, memories, eps);

    if (neighbors.length < minPts) {
      // Noise point - skip
      continue;
    }

    // Start new cluster
    const cluster = [memory];

    // Expand cluster using queue-based approach
    const queue = [...neighbors];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!current || !current.id) continue;
      if (visited.has(current.id)) continue;

      visited.add(current.id);

      const currentNeighbors = findNeighbors(current, memories, eps);
      if (currentNeighbors.length >= minPts) {
        // Add new unvisited neighbors to queue
        const unvisitedNeighbors = currentNeighbors.filter(n => n && n.id && !visited.has(n.id));
        queue.push(...unvisitedNeighbors);
      }

      cluster.push(current);
    }

    // Cap cluster size at maxClusterSize (20)
    if (cluster.length >= minPts) {
      clusters.push(cluster.slice(0, 20));
    }
  }

  return clusters;
}

/**
 * Find neighbors of a memory based on tag similarity or embedding similarity.
 *
 * When useEmbeddings is true and embeddings are available, uses cosine similarity
 * instead of Jaccard tag overlap. Falls back to tag similarity if embeddings
 * are not available.
 *
 * @param target - The memory to find neighbors for
 * @param memories - Array of candidate memories
 * @param eps - Similarity threshold (0-1)
 * @param useEmbeddings - If true, try embedding-based similarity first
 * @returns Array of similar memories
 */
export function findNeighbors(target: any, memories: any[], eps: number, useEmbeddings: boolean = false): any[] {
  if (!target || !target.id) return [];

  // Pre-compute target embedding if using embedding-based similarity
  let targetEmbedding: number[] | null = null;
  if (useEmbeddings) {
    targetEmbedding = parseEmbedding(target.embedding) ?? parseEmbedding(target.embedding_json);
  }

  return memories.filter(m => {
    if (!m || !m.id) return false;
    if (m.id === target.id) return false;

    let similarity: number;

    if (useEmbeddings && targetEmbedding) {
      // Use cosine similarity on embeddings
      const memEmbedding = parseEmbedding(m.embedding) ?? parseEmbedding(m.embedding_json);
      if (memEmbedding) {
        similarity = cosineSimilarity(targetEmbedding, memEmbedding);
        return similarity >= eps;
      }
      // Fall through to tag-based if no embedding
    }

    // Calculate tag overlap similarity (Jaccard)
    const targetTags = new Set(target.tags || []);
    const mTags = new Set(m.tags || []);

    // If both have no tags, no similarity
    if (targetTags.size === 0 && mTags.size === 0) return false;

    const intersection = [...targetTags].filter(t => mTags.has(t)).length;
    const union = new Set([...targetTags, ...mTags]).size;
    similarity = union > 0 ? intersection / union : 0;

    return similarity >= eps;
  });
}

/**
 * Extract pattern from a cluster of memories
 */
export function extractPattern(cluster: any[]): { summary: string; confidence: number; keyPoints: string[] } {
  if (!cluster || cluster.length === 0) {
    return {
      summary: 'Empty cluster',
      confidence: 0,
      keyPoints: []
    };
  }

  // Count tag frequencies
  const allTags = cluster.flatMap(m => m.tags || []);
  const tagCounts = new Map<string, number>();
  allTags.forEach(t => {
    if (t) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  });

  // Get top 5 tags by frequency
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(e => e[0]);

  // Confidence based on cluster size (more memories = higher confidence)
  const confidence = Math.min(1.0, cluster.length / 10);

  return {
    summary: `Cluster of ${cluster.length} memories about: ${topTags.join(', ')}`,
    confidence,
    keyPoints: topTags
  };
}

/**
 * Merge redundant memories in a cluster
 */
async function mergeRedundant(cluster: any[], minConfidence: number): Promise<{ mergedCount: number }> {
  let mergedCount = 0;

  if (!cluster || cluster.length < 2) return { mergedCount };

  // Sort by importance/score (keep highest score as canonical)
  const sorted = [...cluster].sort((a, b) => {
    const scoreA = a.importanceScore || a.score || 0;
    const scoreB = b.importanceScore || b.score || 0;
    return scoreB - scoreA;
  });

  const canonical = sorted[0];
  if (!canonical) return { mergedCount };

  // Phase 1: Collect IDs to merge (CPU-only, no DB)
  const toMerge: { id: string; overlap: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    if (!candidate) continue;

    const overlap = calculateOverlap(canonical.content || '', candidate.content || '');
    if (overlap >= minConfidence) {
      toMerge.push({ id: candidate.id, overlap });
    }
  }

  if (toMerge.length === 0) return { mergedCount };

  // Phase 2: Single batch UPDATE — avoids N+1
  try {
    const { db, schema } = await getDbClient();
    const { inArray } = await import('drizzle-orm');
    const now = new Date();

    const mergeIds = toMerge.map(m => m.id);

    await db
      .update(schema.memories)
      .set({
        status: 'merged',
        mergedIntoId: canonical.id,
        mergedAt: now,
        updatedAt: now,
      })
      .where(inArray(schema.memories.id, mergeIds));

    mergedCount = mergeIds.length;
    logger.info(`Consolidation: Merged ${mergedCount} memories into ${canonical.id}`);
  } catch (error) {
    logger.error('Consolidation: mergeRedundant failed:', error);
  }

  return { mergedCount };
}

/**
 * Calculate content overlap between two strings using Jaccard similarity
 */
export function calculateOverlap(content1: string, content2: string): number {
  if (!content1 && !content2) return 1.0;
  if (!content1 || !content2) return 0.0;

  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 0));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 0));

  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Promote a pattern to the semantic layer
 */
async function promoteToSemantic(pattern: any, projectId?: string): Promise<void> {
  try {
    const { rememberMemory } = await import('../memory/memories.js');

    // Build content from pattern summary and key points
    const content = pattern.keyPoints.length > 0
      ? `${pattern.summary}\n\nKey points: ${pattern.keyPoints.join(', ')}`
      : pattern.summary;

    await rememberMemory({
      content,
      type: 'fact',
      project: projectId || undefined,
      tags: ['auto-promoted', 'semantic', ...(pattern.keyPoints || [])],
      metadata: {
        source: 'consolidation-engine',
        patternConfidence: pattern.confidence,
        keyPoints: pattern.keyPoints,
      },
    });

    logger.info(`Consolidation: Promoted pattern to semantic layer: ${pattern.summary}`);
  } catch (error) {
    logger.error('Consolidation: promoteToSemantic failed:', error);
  }
}

/**
 * Fetch episodic memories from the database
 */
async function fetchEpisodicMemories(projectId?: string): Promise<any[]> {
  try {
    const { db, schema } = await getDbClient();
    const { eq, and, desc } = await import('drizzle-orm');

    const conditions = [
      eq(schema.memories.sector, 'episodic'),
      eq(schema.memories.status, 'active'),
    ];
    if (projectId) {
      conditions.push(eq(schema.memories.projectId, projectId));
    }

    const rows = await db
      .select()
      .from(schema.memories)
      .where(and(...conditions))
      .orderBy(desc(schema.memories.createdAt))
      .limit(100);

    return rows || [];
  } catch (error) {
    logger.error('Error fetching episodic memories:', error);
    return [];
  }
}
