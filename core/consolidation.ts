// Memory Consolidation & Deduplication
import { eq, inArray, and, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { createAssociation } from './associations.js';
import { logger } from './logger.js';
import { consolidateMemories, getConsolidationStats } from './memory/consolidation.js';

export interface ConsolidationStats {
  clustered: number;
  merged: number;
  tokensRecovered: number;
  deduped: number;
  consolidated: number;
}

export interface DeduplicationResult {
  duplicatesFound: number;
  mergedCount: number;
  tokensRecovered: number;
  groups: DuplicateGroup[];
}

export interface DuplicateGroup {
  canonicalId: string;
  duplicateIds: string[];
  similarity: number;
  reason: string;
}

/**
 * Run automated deduplication job
 * Finds and marks duplicates for review or auto-merges high-confidence duplicates
 */
export async function runDeduplicationJob(projectId?: string): Promise<DeduplicationResult> {
  const result: DeduplicationResult = {
    duplicatesFound: 0,
    mergedCount: 0,
    tokensRecovered: 0,
    groups: [],
  };

  try {
    const db = await getDb();
    const schema = await getSchema();
    
    // Get active memories for deduplication check
    const whereClause = projectId
      ? and(
          eq(schema.memories.projectId, projectId),
          eq(schema.memories.status, 'active')
        )
      : eq(schema.memories.status, 'active');
    
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause)
      .limit(500);
    
    if (memories.length < 2) {
      return result;
    }
    
    // Find duplicate groups using SimHash
    const duplicateGroups = await findDuplicatesBySimHash(memories);
    
    result.duplicatesFound = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicateIds.length,
      0
    );
    
    // Auto-merge high-confidence duplicates (>0.95 similarity)
    for (const group of duplicateGroups) {
      if (group.similarity >= 0.95) {
        const tokensSaved = await autoMergeDuplicates(
          group.canonicalId,
          group.duplicateIds
        );
        result.mergedCount += group.duplicateIds.length;
        result.tokensRecovered += tokensSaved;
      } else {
        // Lower confidence - just create association for review
        for (const dupId of group.duplicateIds) {
          await createAssociation(
            group.canonicalId,
            dupId,
            'duplicate',
            group.similarity
          );
        }
      }
      result.groups.push(group);
    }
    
    logger.info('Deduplication job completed', {
      duplicatesFound: result.duplicatesFound,
      mergedCount: result.mergedCount,
      tokensRecovered: result.tokensRecovered,
    });
    
  } catch (error) {
    logger.error('Deduplication job error', error);
  }
  
  return result;
}

/**
 * Find duplicates using SimHash (efficient near-duplicate detection)
 */
async function findDuplicatesBySimHash(memories: any[]): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();
  
  // Compute SimHash for each memory
  const hashes = memories.map(m => ({
    id: m.id,
    hash: computeSimHash(m.content),
    content: m.content,
    createdAt: m.createdAt,
  }));
  
  // Compare hashes to find similar content
  for (let i = 0; i < hashes.length; i++) {
    if (processed.has(hashes[i].id)) continue;
    
    const duplicates: string[] = [];
    let maxSimilarity = 0;
    
    for (let j = i + 1; j < hashes.length; j++) {
      if (processed.has(hashes[j].id)) continue;
      
      const hammingDistance = computeHammingDistance(hashes[i].hash, hashes[j].hash);
      const similarity = 1 - (hammingDistance / 64); // 64-bit hash
      
      if (similarity >= 0.85) {
        duplicates.push(hashes[j].id);
        maxSimilarity = Math.max(maxSimilarity, similarity);
        processed.add(hashes[j].id);
      }
    }
    
    if (duplicates.length > 0) {
      processed.add(hashes[i].id);
      groups.push({
        canonicalId: hashes[i].id, // Keep oldest as canonical
        duplicateIds: duplicates,
        similarity: maxSimilarity,
        reason: 'content-similarity',
      });
    }
  }
  
  return groups;
}

/**
 * Compute SimHash for text (64-bit fingerprint)
 */
function computeSimHash(text: string): bigint {
  const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const weights = new Array(64).fill(0);
  
  for (const token of tokens) {
    const hash = simpleHash(token);
    for (let i = 0; i < 64; i++) {
      if ((hash >> BigInt(i)) & 1n) {
        weights[i] += 1;
      } else {
        weights[i] -= 1;
      }
    }
  }
  
  let simHash = 0n;
  for (let i = 0; i < 64; i++) {
    if (weights[i] > 0) {
      simHash |= (1n << BigInt(i));
    }
  }
  
  return simHash;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): bigint {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = BigInt(str.charCodeAt(i));
    hash = ((hash << 5n) - hash) + char;
    hash = hash & hash; // Convert to 64bit integer
  }
  return hash;
}

/**
 * Compute Hamming distance between two hashes
 */
function computeHammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  while (xor !== 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

/**
 * Auto-merge duplicates into canonical memory
 */
async function autoMergeDuplicates(
  canonicalId: string,
  duplicateIds: string[]
): Promise<number> {
  try {
    const db = await getDb();
    const schema = await getSchema();
    const now = new Date();
    
    // Calculate tokens recovered
    const duplicates = await (db as any)
      .select()
      .from(schema.memories)
      .where(inArray(schema.memories.id, duplicateIds));
    
    let tokensRecovered = 0;
    for (const dup of duplicates) {
      tokensRecovered += Math.ceil((dup.content?.length || 0) / 4);
    }
    
    // Mark duplicates as merged
    await (db as any)
      .update(schema.memories)
      .set({
        status: 'merged',
        mergedInto: canonicalId,
        mergedAt: now,
        updatedAt: now,
      })
      .where(inArray(schema.memories.id, duplicateIds));
    
    // Create associations for traceability
    for (const dupId of duplicateIds) {
      await createAssociation(canonicalId, dupId, 'merged', 0.95);
    }
    
    return tokensRecovered;
    
  } catch (error) {
    logger.error('Error auto-merging duplicates', error);
    return 0;
  }
}

/**
 * Run full consolidation job (dedup + memory consolidation)
 */
export async function runFullConsolidationJob(projectId?: string): Promise<ConsolidationStats> {
  const stats: ConsolidationStats = {
    clustered: 0,
    merged: 0,
    tokensRecovered: 0,
    deduped: 0,
    consolidated: 0,
  };
  
  // Run deduplication first
  const dedupResult = await runDeduplicationJob(projectId);
  stats.deduped = dedupResult.duplicatesFound;
  stats.merged = dedupResult.mergedCount;
  stats.tokensRecovered += dedupResult.tokensRecovered;
  
  // Run memory consolidation for each project
  if (projectId) {
    const consolidationResults = await consolidateMemories({
      projectId,
      minAge: 60,
      maxImportance: 25,
      minClusterSize: 3,
      limit: 100,
    });
    stats.consolidated = consolidationResults.length;
    stats.clustered = consolidationResults.reduce(
      (sum, r) => sum + r.clusterSize,
      0
    );
  }
  
  logger.info('Full consolidation job completed', stats);
  
  return stats;
}

/**
 * Get deduplication statistics
 */
export async function getDeduplicationStats(projectId?: string): Promise<{
  totalMemories: number;
  mergedMemories: number;
  pendingDuplicates: number;
}> {
  try {
    const db = await getDb();
    const schema = await getSchema();
    
    const whereClause = projectId
      ? eq(schema.memories.projectId, projectId)
      : undefined;
    
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause);
    
    return {
      totalMemories: memories.length,
      mergedMemories: memories.filter((m: any) => m.status === 'merged').length,
      pendingDuplicates: 0, // Would need to query associations
    };
    
  } catch (error) {
    logger.error('Error getting deduplication stats', error);
    return { totalMemories: 0, mergedMemories: 0, pendingDuplicates: 0 };
  }
}
