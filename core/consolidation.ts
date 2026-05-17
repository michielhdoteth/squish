// Memory Consolidation & Deduplication
import { eq, inArray, and, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { config } from '../config.js';
import { createAssociation } from './associations.js';
import { logger } from './logger.js';
import { consolidateMemories, getConsolidationStats } from './memory/consolidation.js';
import { callLLM } from './llm/client.js';

/**
 * Options for unified full maintenance run (Phase 6)
 */
export interface FullMaintenanceOptions {
  projectId?: string;
  dryRun?: boolean;
  steps?: ('dedup' | 'stale' | 'consolidate' | 'inbox')[];
  age?: number; // days threshold
  llmEnabled?: boolean; // use LLM for enhanced steps
}

/**
 * Result of a unified full maintenance run
 */
export interface FullMaintenanceResult {
  ok: boolean;
  steps: Record<string, { ok: boolean; count: number; error?: string }>;
  dryRun: boolean;
}

export interface ConsolidationStats {
  clustered: number;
  merged: number;
  tokensRecovered: number;
  deduped: number;
  consolidated: number;
  // Geometry-aware consolidation stats
  geometrySafeClusters?: number;
  geometrySkippedClusters?: number;
  avgDBar?: number;
  avgDEff?: number;
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
    
    // Find duplicate groups using SimHash (fast structural dedup)
    const duplicateGroups = await findDuplicatesBySimHash(memories);
    
    result.duplicatesFound = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicateIds.length,
      0
    );

    // Second pass: semantic dedup using LLM when available
    // This catches near-duplicates that SimHash misses (different wording, same meaning)
    if (config.llmEnabled && memories.length >= 2) {
      try {
        const processedIds = new Set<string>();
        for (const g of duplicateGroups) {
          processedIds.add(g.canonicalId);
          for (const d of g.duplicateIds) processedIds.add(d);
        }

        const semanticGroups = await findSemanticDuplicates(
          memories,
          processedIds
        );

        for (const group of semanticGroups) {
          duplicateGroups.push(group);
          result.duplicatesFound += group.duplicateIds.length;
        }

        if (semanticGroups.length > 0) {
          logger.debug(`Semantic dedup found ${semanticGroups.length} additional groups`);
        }
      } catch {
        // LLM semantic dedup failed silently - continue with SimHash results
        logger.debug('Semantic dedup pass failed, continuing with SimHash results');
      }
    }
    
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
 * Exported for testing.
 */
export function computeSimHash(text: string): bigint {
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
 * Find semantic near-duplicates using LLM.
 * This catches pairs that SimHash misses (different wording, same meaning).
 * Only checks memories not already in SimHash groups.
 * LLM is optional - returns empty array on any failure.
 */
async function findSemanticDuplicates(
  memories: any[],
  alreadyProcessed: Set<string>
): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];

  // Only check candidates not already processed
  const candidates = memories.filter(m => !alreadyProcessed.has(m.id));

  // Limit comparisons to avoid excessive LLM calls
  const MAX_COMPARISONS = 10;
  let comparisons = 0;

  for (let i = 0; i < candidates.length && comparisons < MAX_COMPARISONS; i++) {
    for (let j = i + 1; j < candidates.length && comparisons < MAX_COMPARISONS; j++) {
      comparisons++;

      const content1 = candidates[i].content || '';
      const content2 = candidates[j].content || '';

      // Skip if contents are too short to compare meaningfully
      if (content1.length < 10 || content2.length < 10) continue;

      try {
        const prompt = `Compare these two texts. Are they semantically similar (same meaning, different wording)?

TEXT 1: ${content1.slice(0, 300)}
TEXT 2: ${content2.slice(0, 300)}

Answer with just "yes" or "no":`;

        const response = await callLLM(prompt);
        if (response && response.toLowerCase().startsWith('yes')) {
          groups.push({
            canonicalId: candidates[i].id,
            duplicateIds: [candidates[j].id],
            similarity: 0.9, // LLM-detected duplicates get high similarity
            reason: 'semantic-similarity',
          });
          alreadyProcessed.add(candidates[j].id);
        }
      } catch {
        // Silent failure for individual comparison
        continue;
      }
    }
  }

  return groups;
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

    // Aggregate geometry stats if available
    const resultsWithGeo = consolidationResults.filter(r => r.geometrySafe !== undefined);
    if (resultsWithGeo.length > 0) {
      stats.geometrySafeClusters = resultsWithGeo.filter(r => r.geometrySafe).length;
      stats.geometrySkippedClusters = resultsWithGeo.filter(r => !r.geometrySafe).length;

      const dBarValues = resultsWithGeo.filter(r => r.dBar !== undefined).map(r => r.dBar!);
      const dEffValues = resultsWithGeo.filter(r => r.dEff !== undefined).map(r => r.dEff!);

      if (dBarValues.length > 0) {
        stats.avgDBar = dBarValues.reduce((s, v) => s + v, 0) / dBarValues.length;
      }
      if (dEffValues.length > 0) {
        stats.avgDEff = dEffValues.reduce((s, v) => s + v, 0) / dEffValues.length;
      }
    }
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

/**
 * Run all maintenance steps in sequence: dedup -> stale -> consolidate -> inbox.
 * Standard mode (no LLM) by default. LLM auto-detected from config.llmEnabled.
 *
 * This is the unified entry point for `squish clean`.
 *
 * @param options - Optional configuration
 * @returns Aggregated results per step
 */
export async function runFullMaintenance(
  options?: FullMaintenanceOptions
): Promise<FullMaintenanceResult> {
  const {
    projectId,
    dryRun = false,
    steps = ['dedup', 'stale', 'consolidate', 'inbox'],
    age,
    llmEnabled,
  } = options ?? {};

  const stepResults: Record<string, { ok: boolean; count: number; error?: string }> = {};
  const useLlm = llmEnabled !== undefined ? llmEnabled : config.llmEnabled;

  // Cache original llm config if temporarily overriding
  const origLlmEnabled = config.llmEnabled;

  try {
    // Temporarily override llmEnabled for this run if specified
    if (llmEnabled !== undefined && llmEnabled !== config.llmEnabled) {
      (config as any).llmEnabled = llmEnabled;
    }

    // --- Step 1: Dedup ---
    if (steps.includes('dedup')) {
      try {
        const dedupResult = await runDeduplicationJob(projectId);
        stepResults.dedup = {
          ok: true,
          count: dedupResult.duplicatesFound,
          error: undefined,
        };
        logger.info(`[FullMaintenance] dedup: ${dedupResult.duplicatesFound} duplicates found, ${dedupResult.mergedCount} merged`);
      } catch (error: any) {
        stepResults.dedup = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] dedup step failed:', error);
      }
    }

    // --- Step 2: Stale cleanup ---
    if (steps.includes('stale')) {
      try {
        const { getStaleMemories, runAutoClean, deleteMemoryPermanently } = await import('./memory/stale-cleaner.js');

        if (dryRun) {
          // Dry-run: just count what would be cleaned
          const stale = await getStaleMemories({
            olderThanDays: age ?? 30,
            confidenceLevels: ['outdated', 'speculative'],
            minImportance: 40,
            projectId,
          });
          const unpinnedCount = stale.filter((m: any) => !m.isPinned).length;
          stepResults.stale = {
            ok: true,
            count: unpinnedCount,
            error: undefined,
          };
          logger.info(`[FullMaintenance] stale (dry-run): ${unpinnedCount} memories would be cleaned`);
        } else {
          const result = await runAutoClean({
            olderThanDays: age,
            confidenceLevels: ['outdated', 'speculative'],
            minImportance: 40,
            projectId,
          });
          stepResults.stale = {
            ok: true,
            count: result.deleted,
            error: undefined,
          };
          logger.info(`[FullMaintenance] stale: ${result.deleted} memories cleaned`);
        }
      } catch (error: any) {
        stepResults.stale = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] stale step failed:', error);
      }
    }

    // --- Step 3: Consolidation ---
    if (steps.includes('consolidate')) {
      try {
        if (projectId) {
          const consolidationResults = await consolidateMemories({
            projectId,
            minAge: age,
            maxImportance: 30,
            minClusterSize: 3,
            similarityThreshold: 0.7,
            limit: 100,
          });
          const totalSources = consolidationResults.reduce(
            (sum, r) => sum + (r.clusterSize || 0),
            0
          );
          stepResults.consolidate = {
            ok: true,
            count: totalSources,
            error: undefined,
          };
          logger.info(`[FullMaintenance] consolidate: ${consolidationResults.length} clusters, ${totalSources} sources`);
        } else {
          // No project specified - skip consolidation
          stepResults.consolidate = {
            ok: true,
            count: 0,
            error: undefined,
          };
          logger.info('[FullMaintenance] consolidate: skipped (no project specified)');
        }
      } catch (error: any) {
        stepResults.consolidate = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] consolidate step failed:', error);
      }
    }

    // --- Step 4: Inbox triage ---
    if (steps.includes('inbox')) {
      try {
        const { processInboxForAllProjects } = await import('./places/memory-places.js');
        const inboxResult = await processInboxForAllProjects();
        stepResults.inbox = {
          ok: true,
          count: inboxResult.totalMoved,
          error: undefined,
        };
        logger.info(`[FullMaintenance] inbox: ${inboxResult.totalMoved} moved, ${inboxResult.totalErrors} errors`);
      } catch (error: any) {
        stepResults.inbox = {
          ok: false,
          count: 0,
          error: error.message || String(error),
        };
        logger.error('[FullMaintenance] inbox step failed:', error);
      }
    }

    logger.info('[FullMaintenance] completed', { dryRun, steps: Object.keys(stepResults) });

    return {
      ok: true,
      steps: stepResults,
      dryRun,
    };
  } catch (error: any) {
    logger.error('[FullMaintenance] unexpected error:', error);
    return {
      ok: false,
      steps: stepResults,
      dryRun,
    };
  } finally {
    // Restore original llm config
    if (llmEnabled !== undefined && llmEnabled !== origLlmEnabled) {
      (config as any).llmEnabled = origLlmEnabled;
    }
  }
}
