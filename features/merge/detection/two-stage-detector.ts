/**
 * Two-stage duplicate detection orchestrator
 *
 * Combines:
 * - Stage 1: Fast hash-based prefiltering (SimHash + MinHash)
 * - Stage 2: Semantic ranking using embeddings
 *
 * This is the main entry point for finding duplicate memories.
 */

import type { Memory, MemoryType } from '../../../drizzle/schema.js';
import { getEmbedding } from '../../../core/embeddings.js';
import { SimHashFilter, MinHashFilter, findCandidatePairs } from './hash-filters.js';
import { rankCandidates, analyzePair } from './semantic-ranker.js';
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq, and } from 'drizzle-orm';

export interface MemoryPair {
  memory1: Memory;
  memory2: Memory;
  similarityScore: number;
  detectionMethod: 'simhash' | 'minhash' | 'embedding';
  confidenceLevel: 'high' | 'medium' | 'low';
  mergeReason: string;
}

export interface DetectionResult {
  candidates: MemoryPair[];
  stage1Time: number; // Duration in ms
  stage2Time: number;
  totalCandidates: number; // Number of candidate pairs found
  filteredCandidates: number; // Final ranked candidates
  statistics: {
    totalMemories: number;
    memoriesByType: Record<MemoryType, number>;
  };
}

export interface DetectionOptions {
  projectId?: string; // Filter by project
  type?: MemoryType; // Filter by memory type
  threshold?: number; // Semantic similarity threshold (0-1, default 0.85)
  limit?: number; // Max proposals to generate (default 50)
  simhashThreshold?: number; // Stage 1 SimHash threshold (default 4)
  minhashThreshold?: number; // Stage 1 MinHash threshold (default 0.7)
  stage1Only?: boolean; // Skip stage 2 for testing (default false)
}

/**
 * Main entry point for two-stage duplicate detection
 *
 * Algorithm:
 * 1. Load all memories from database, optionally filtered by project/type
 * 2. Generate hashes for all memories (SimHash + MinHash)
 * 3. Stage 1: Find candidate pairs using hash-based prefilter
 * 4. Stage 2: Rank candidates by semantic similarity (embedding cosine)
 * 5. Return sorted list of detected duplicates
 *
 * @param options Detection configuration
 * @returns DetectionResult with candidate pairs and statistics
 */
export async function detectDuplicates(options: DetectionOptions): Promise<DetectionResult> {
  const startTime = Date.now();
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Stage 0: Load memories from database
  let query: any = db.select().from(schema.memories);

  // Filter by project if specified
  if (options.projectId) {
    query = query.where(eq(schema.memories.projectId, options.projectId));
  }

  // Filter by type if specified
  if (options.type) {
    query = query.where(eq(schema.memories.type, options.type));
  }

  // Exclude already-merged memories and non-mergeable ones
  query = query.where(
    and(
      eq(schema.memories.isMerged, false),
      eq(schema.memories.isMergeable, true),
      eq(schema.memories.isActive, true)
    )
  );

  const memories: Memory[] = await query.execute();

  if (memories.length < 2) {
    return {
      candidates: [],
      stage1Time: 0,
      stage2Time: 0,
      totalCandidates: 0,
      filteredCandidates: 0,
      statistics: {
        totalMemories: memories.length,
        memoriesByType: countByType(memories),
      },
    };
  }

  // Create maps for efficient lookups
  const memoriesById = new Map(memories.map((m) => [m.id, m]));
  const contentById = new Map(memories.map((m) => [m.id, m.content]));

  // Generate hash signatures for all memories
  const simhashFilter = new SimHashFilter();
  const minhashFilter = new MinHashFilter();

  const allSimhashes = new Map<string, string>();
  const allMinhashes = new Map<string, number[]>();

  for (const memory of memories) {
    allSimhashes.set(memory.id, simhashFilter.generateHash(memory.content));
    allMinhashes.set(memory.id, minhashFilter.generateSignature(memory.content));
  }

  // Stage 1: Hash-based prefiltering
  const stage1Start = Date.now();
  const stage1Candidates = findCandidatePairs(contentById, allSimhashes, allMinhashes, {
    simhashThreshold: options.simhashThreshold ?? 4,
    minhashThreshold: options.minhashThreshold ?? 0.7,
  });

  const stage1Time = Date.now() - stage1Start;

  // If stage1Only flag is set, return early (for testing)
  if (options.stage1Only) {
    return {
      candidates: stage1Candidates.map((pair) => ({
        memory1: memoriesById.get(pair.memoryId1)!,
        memory2: memoriesById.get(pair.memoryId2)!,
        similarityScore: Math.max(
          1 - pair.simhashDistance / 64,
          pair.minhashSimilarity
        ),
        detectionMethod: pair.matched === 'both' ? 'simhash' : pair.matched,
        confidenceLevel: 'low',
        mergeReason: 'Stage 1 candidate (embedding analysis skipped)',
      })),
      stage1Time,
      stage2Time: 0,
      totalCandidates: stage1Candidates.length,
      filteredCandidates: stage1Candidates.length,
      statistics: {
        totalMemories: memories.length,
        memoriesByType: countByType(memories),
      },
    };
  }

  // Stage 2: Semantic ranking using embeddings
  const stage2Start = Date.now();

  // Load or generate embeddings
  const embeddings = new Map<string, number[]>();
  for (const memory of memories) {
    if (memory.embedding) {
      embeddings.set(memory.id, memory.embedding as unknown as number[]);
    } else {
      // Generate embedding if missing
      const embedding = await getEmbedding(memory.content);
      if (embedding) {
        embeddings.set(memory.id, embedding);
      }
    }
  }

  // Rank candidates using semantic similarity
  const rankedCandidates = await rankCandidates(
    stage1Candidates.map((pair) => ({
      memoryId1: pair.memoryId1,
      memoryId2: pair.memoryId2,
    })),
    memoriesById,
    embeddings,
    {
      semanticThreshold: options.threshold ?? 0.85,
      topK: 10,
    }
  );

  const stage2Time = Date.now() - stage2Start;

  // Convert to output format
  const candidates: MemoryPair[] = rankedCandidates.map((ranked) => ({
    memory1: ranked.memory1,
    memory2: ranked.memory2,
    similarityScore: ranked.cosineSimilarity,
    detectionMethod: 'embedding',
    confidenceLevel: ranked.confidenceLevel,
    mergeReason: ranked.mergeReason,
  }));

  // Apply limit
  const limited = candidates.slice(0, options.limit ?? 50);

  return {
    candidates: limited,
    stage1Time,
    stage2Time,
    totalCandidates: stage1Candidates.length,
    filteredCandidates: rankedCandidates.length,
    statistics: {
      totalMemories: memories.length,
      memoriesByType: countByType(memories),
    },
  };
}

/**
 * Analyze a specific pair of memories for merge feasibility
 * Used for interactive merge previews
 */
export async function analyzeMergePair(
  memoryId1: string,
  memoryId2: string
): Promise<{
  memory1: Memory;
  memory2: Memory;
  analysis: ReturnType<typeof analyzePair>;
} | null> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Load both memories
  const [memory1] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId1));

  const [memory2] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId2));

  if (!memory1 || !memory2) {
    return null;
  }

  // Get embeddings
  const embedding1 = memory1.embedding || (await getEmbedding(memory1.content)) || [];
  const embedding2 = memory2.embedding || (await getEmbedding(memory2.content)) || [];

  if (!embedding1 || !embedding2 || embedding1.length === 0 || embedding2.length === 0) {
    return null;
  }

  // Analyze
  const analysis = analyzePair(
    memory1,
    memory2,
    embedding1 as unknown as number[],
    embedding2 as unknown as number[]
  );

  return {
    memory1,
    memory2,
    analysis,
  };
}

/**
 * Count memories by type
 */
function countByType(memories: Memory[]): Record<MemoryType, number> {
  const counts: Record<MemoryType, number> = {
    observation: 0,
    fact: 0,
    decision: 0,
    context: 0,
    preference: 0,
  };

  for (const memory of memories) {
    const type = memory.type as MemoryType;
    if (type in counts) {
      counts[type]++;
    }
  }

  return counts;
}

/**
 * Get detection statistics for a project
 */
export async function getDetectionStats(projectId: string): Promise<{
  totalMemories: number;
  mergeableMemories: number;
  mergedMemories: number;
  canonicalMemories: number;
  memoriesByType: Record<MemoryType, number>;
}> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  const memories: Memory[] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId));

  const totalMemories = memories.length;
  const mergedMemories = memories.filter((m) => m.isMerged).length;
  const canonicalMemories = memories.filter((m) => m.isCanonical).length;
  const mergeableMemories = memories.filter((m) => m.isMergeable && !m.isMerged).length;

  return {
    totalMemories,
    mergeableMemories,
    mergedMemories,
    canonicalMemories,
    memoriesByType: countByType(memories),
  };
}
