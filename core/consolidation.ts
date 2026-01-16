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


