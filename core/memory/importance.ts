/**
 * Importance Scoring System
 * Calculates and manages memory importance scores (0-100) with temporal decay
 */

import type { Memory } from '../../db/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { cosineSimilarity as vectorCosineSimilarity } from '../utils/vector-operations.js';
import { getDbClient } from '../lib/db-client.js';
import { getImportanceEngine } from '../engines/flags.js';
import {
  calculateImportanceV2,
  normalizeImportanceScore,
  denormalizeImportanceScore,
  detectSurprise,
  detectEmotion,
} from '../scoring/importance-v2.js';

export interface ImportanceScore {
  score: number; // 0-100
  components: {
    base: number;
    recency: number;
    accessFrequency: number;
    typeWeight: number;
    userFlags: number;
  };
  explanation: string;
}

/**
 * Type weights for importance scoring
 * Higher values = more important memory types
 */
const TYPE_WEIGHTS: Record<string, number> = {
  decision: 15,
  fact: 10,
  preference: 8,
  context: 5,
  observation: 0,
};

/**
 * Calculate importance score for a memory
 *
 * Formula: base + recency + accessFrequency + typeWeight + userFlags
 * All values are clamped to 0-100 range
 */
export function calculateImportance(memory: Partial<Memory>): ImportanceScore {
  const components = {
    base: 50, // Neutral starting point
    recency: calculateRecencyComponent(memory),
    accessFrequency: calculateAccessFrequencyComponent(memory),
    typeWeight: calculateTypeWeightComponent(memory),
    userFlags: calculateUserFlagsComponent(memory),
  };

  // Calculate total score (clamped to 0-100)
  const score = Math.min(
    100,
    Math.max(
      0,
      components.base +
        components.recency +
        components.accessFrequency +
        components.typeWeight +
        components.userFlags
    )
  );

  return {
    score,
    components,
    explanation: generateImportanceExplanation(components, memory),
  };
}

/**
 * Calculate recency component (0-30 points)
 * Uses exponential decay based on memory age
 */
function calculateRecencyComponent(memory: Partial<Memory>): number {
  if (!memory.createdAt) return 0;

  const now = Date.now();
  const createdAt = new Date(memory.createdAt).getTime();
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);

  // Decay rate: default 30 days half-life
  const decayRate = memory.importanceDecayRate ?? 30;

  // Exponential decay: 30 * (0.5 ^ (age / halfLife))
  // Maximum 30 points for very recent memories
  const recencyScore = 30 * Math.pow(0.5, ageDays / decayRate);

  return Math.max(0, Math.min(30, recencyScore));
}

/**
 * Calculate access frequency component (0-15 points)
 * More frequently accessed memories are more important
 */
function calculateAccessFrequencyComponent(memory: Partial<Memory>): number {
  const accessCount = memory.accessCount ?? 0;
  const usageCount = memory.usageCount ?? 0;

  // Combined access count (from both fields)
  const totalAccess = accessCount + usageCount;

  // Logarithmic scaling: 15 * log10(totalAccess + 1)
  // This gives diminishing returns for high access counts
  const accessScore = 15 * Math.log10(totalAccess + 1);

  return Math.min(15, accessScore);
}

/**
 * Calculate type weight component (0-15 points)
 * Different memory types have different inherent importance
 */
function calculateTypeWeightComponent(memory: Partial<Memory>): number {
  const type = memory.type ?? 'observation';
  return TYPE_WEIGHTS[type] ?? 0;
}

/**
 * Calculate user flags component (0 or +20 points)
 * Pinned or protected memories get maximum importance
 */
function calculateUserFlagsComponent(memory: Partial<Memory>): number {
  // Pinned memories get maximum boost
  if (memory.isPinned) return 20;

  // Protected memories also get significant boost
  if (memory.isProtected) return 15;

  // Immutable memories are important but not as much
  if (memory.isImmutable) return 10;

  return 0;
}

/**
 * Generate human-readable explanation for importance score
 */
function generateImportanceExplanation(
  components: ImportanceScore['components'],
  memory: Partial<Memory>
): string {
  const parts: string[] = [];

  // Base score
  parts.push(`base: ${components.base}`);

  // Recency
  if (components.recency > 20) {
    parts.push('very recent');
  } else if (components.recency > 10) {
    parts.push('recent');
  } else if (components.recency > 0) {
    parts.push('somewhat recent');
  }

  // Access frequency
  const totalAccess = (memory.accessCount ?? 0) + (memory.usageCount ?? 0);
  if (totalAccess > 10) {
    parts.push('frequently accessed');
  } else if (totalAccess > 3) {
    parts.push('occasionally accessed');
  }

  // Type
  const type = memory.type ?? 'observation';
  if (type !== 'observation') {
    parts.push(`${type} type`);
  }

  // User flags
  if (memory.isPinned) {
    parts.push('pinned by user');
  } else if (memory.isProtected) {
    parts.push('protected');
  }

  return parts.join(', ');
}

/**
 * Update importance score for a memory
 * Used when memory is accessed or modified
 */
export async function updateImportanceScore(
    memoryId: string,
    incrementAccess: boolean = false
  ): Promise<number> {
    const { db, schema } = await getDbClient();

    // Get current memory
  const memories = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId))
    .limit(1);

  if (memories.length === 0) {
    throw new Error(`Memory not found: ${memoryId}`);
  }

  const memory = memories[0];

  // Calculate new importance score (v1 baseline, v2 override via flag —
  // mirrors computeInitialImportance dispatch in core/engines/importance-engine.ts)
  const importance = calculateImportance(memory);
  let finalScore = importance.score;
  if (getImportanceEngine() === 'v2') {
    try {
      finalScore = denormalizeImportanceScore(
        calculateImportanceV2({
          baseImportance: normalizeImportanceScore(importance.score),
          surprise: detectSurprise({ content: memory.content ?? '', type: memory.type ?? 'observation' }, []),
          emotion: detectEmotion(memory.content ?? ''),
        })
      );
    } catch {
      // v2 failure -> keep v1 score
    }
  }

  // Update memory with new score
  const updateData: any = {
    importanceScore: finalScore,
    lastImportanceRecalc: new Date(),
  };

  // Increment access count if requested
  if (incrementAccess) {
    updateData.accessCount = (memory.accessCount ?? 0) + 1;
    updateData.lastAccessedAt = new Date();
  }

  await db
    .update(schema.memories)
    .set(updateData)
    .where(eq(schema.memories.id, memoryId));

  return importance.score;
}

/**
 * Get low-importance memories that are candidates for consolidation
 * These are old, rarely accessed memories with low importance scores
 */
export async function getLowImportanceMemories(
    projectId: string,
    options: {
      minAge?: number; // days
      maxImportance?: number; // 0-100
      limit?: number;
    } = {}
  ): Promise<any[]> {
    const { db, schema } = await getDbClient();

    const {
    minAge = 90, // 90 days old by default
    maxImportance = 30, // importance score below 30
    limit = 100,
  } = options;

  const minAgeTimestamp = new Date(Date.now() - minAge * 24 * 60 * 60 * 1000);

  const memories = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.projectId, projectId))
    .all();

  // Filter by criteria
  return memories
    .filter((m: any) => {
      // Skip pinned/protected/consolidated
      if (m.isPinned || m.isProtected || m.isConsolidated) {
        return false;
      }

      // Check age
      if (m.createdAt) {
        const createdAt = new Date(m.createdAt).getTime();
        if (createdAt > minAgeTimestamp.getTime()) {
          return false;
        }
      }

      // Check importance
      if ((m.importanceScore ?? 50) > maxImportance) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

/**
 * Set importance score manually (for user override)
 */
export async function setImportanceScore(
    memoryId: string,
    score: number
  ): Promise<void> {
    if (score < 0 || score > 100) {
      throw new Error('Importance score must be between 0 and 100');
    }

    const { db, schema } = await getDbClient();

    await db
    .update(schema.memories)
    .set({
      importanceScore: Math.round(score),
      lastImportanceRecalc: new Date(),
    })
    .where(eq(schema.memories.id, memoryId));
}

// cosineSimilarity has been removed - import from core/utils/vector-operations.ts directly
