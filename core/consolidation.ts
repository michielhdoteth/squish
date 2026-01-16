// Memory Consolidation & Deduplication
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { createAssociation } from './associations.js';

export interface ConsolidationStats {
  clustered: number;
  merged: number;
  tokensRecovered: number;
}

export async function consolidateMemories(projectId?: string): Promise<ConsolidationStats> {
  if (!config.consolidationEnabled) {
    throw new Error('Memory consolidation is disabled');
  }

  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = projectId ? eq(schema.memories.projectId, projectId) : undefined;
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(where)
      .limit(1000);

    const stats: ConsolidationStats = {
      clustered: 0,
      merged: 0,
      tokensRecovered: 0,
    };

    const clusters = await clusterSimilarMemories(memories);
    stats.clustered = clusters.length;

    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const representative = cluster[0];
        const mergedContent = cluster.map((m: any) => m.content).join('\n---\n');

        await (db as any)
          .update(schema.memories)
          .set({
            content: mergedContent,
            metadata: {
              clusterId: representative.id,
              clusterSize: cluster.length,
              sourceMemories: cluster.map((m: any) => m.id),
              consolidatedAt: new Date().toISOString(),
            },
          })
          .where(eq(schema.memories.id, representative.id));

        for (let i = 1; i < cluster.length; i++) {
          await (db as any)
            .update(schema.memories)
            .set({
              supersededBy: representative.id,
              isActive: false,
            })
            .where(eq(schema.memories.id, cluster[i].id));

          await createAssociation(representative.id, cluster[i].id, 'supersedes', 100);
          stats.merged++;
        }

        stats.tokensRecovered += estimateTokenRecovery(cluster);
      }
    }

    return stats;
  } catch (error) {
    console.error('[squish] Error consolidating memories:', error);
    throw error;
  }
}

async function clusterSimilarMemories(memories: any[]): Promise<any[][]> {
  const clusters: any[][] = [];
  const visited = new Set<string>();
  const threshold = config.consolidationSimilarityThreshold || 0.8;

  for (const memory of memories) {
    if (visited.has(memory.id)) continue;

    const cluster = [memory];
    visited.add(memory.id);

    for (const other of memories) {
      if (visited.has(other.id)) continue;

      const similarity = computeJaccardSimilarity(memory.content, other.content);
      if (similarity > threshold) {
        cluster.push(other);
        visited.add(other.id);
      }
    }

    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

function computeJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));

  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

function estimateTokenRecovery(cluster: any[]): number {
  let totalTokens = 0;
  for (const mem of cluster) {
    totalTokens += Math.ceil((mem.content || '').length / 4);
  }
  return Math.max(0, totalTokens - Math.ceil(cluster[0].content.length / 4));
}

export async function getDeduplicationStats(projectId?: string): Promise<{
  totalMemories: number;
  potentialDuplicates: number;
  estimatedRecovery: number;
}> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = projectId ? eq(schema.memories.projectId, projectId) : undefined;
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(where)
      .limit(1000);

    const threshold = config.consolidationSimilarityThreshold || 0.8;
    let duplicates = 0;
    let recovery = 0;

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const sim = computeJaccardSimilarity(memories[i].content, memories[j].content);
        if (sim > threshold) {
          duplicates++;
          recovery += Math.ceil(memories[j].content.length / 4);
        }
      }
    }

    return {
      totalMemories: memories.length,
      potentialDuplicates: duplicates,
      estimatedRecovery: recovery,
    };
  } catch (error) {
    console.error('[squish] Error getting deduplication stats:', error);
    return { totalMemories: 0, potentialDuplicates: 0, estimatedRecovery: 0 };
  }
}
