/**
 * Unified Knowledge Decay Engine
 * 
 * Applies Ebbinghaus decay to ALL knowledge kinds (memories, beliefs, strategies)
 * with kind-specific parameters.
 */

import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import { updateKnowledge, getKnowledgeById, listKnowledgeByKind } from './store.js';
import type { KnowledgeKind, Knowledge, KnowledgeStatus } from './types.js';

// ─── Configuration ───────────────────────────────────────────────────────────

interface DecayConfig {
  /** Half-life in days before confidence decays by 50% */
  halfLifeDays: number;
  /** Minimum confidence before auto-deprecation */
  minConfidence: number;
  /** Confidence boost on success (belief confirmation / strategy success) */
  successBoost: number;
  /** Decay factor applied per day */
  dailyDecayFactor: number;
}

const KIND_DECAY_CONFIGS: Record<KnowledgeKind, DecayConfig> = {
  memory: {
    halfLifeDays: 30,
    minConfidence: 0.05,
    successBoost: 0.05,
    dailyDecayFactor: 0.977,  // ~30 day half-life
  },
  belief: {
    halfLifeDays: 60,          // Beliefs decay slower (more stable)
    minConfidence: 0.10,
    successBoost: 0.08,
    dailyDecayFactor: 0.988,  // ~60 day half-life
  },
  strategy: {
    halfLifeDays: 45,          // Strategies decay medium speed
    minConfidence: 0.05,
    successBoost: 0.05,
    dailyDecayFactor: 0.985,  // ~45 day half-life
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate days since a given timestamp.
 */
function daysSince(timestamp: number | Date | null): number {
  if (!timestamp) return 365;
  const ts = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  return Math.max(0, (Date.now() - ts) / (24 * 60 * 60 * 1000));
}

/**
 * Calculate importance score from confidence and recency.
 * This replaces the per-kind importance_score fields.
 */
function calculateImportanceScore(
  confidence: number,
  daysSinceLastUse: number,
  usageCount: number,
  config: DecayConfig,
): number {
  // Confidence weight (0.6)
  const confidenceScore = confidence * 0.6;
  
  // Recency weight (0.3) — newer is better
  const recencyScore = Math.max(0, 1 - (daysSinceLastUse / (config.halfLifeDays * 3))) * 0.3;
  
  // Usage weight (0.1) — more used = more important
  const usageScore = Math.min(1, usageCount / 20) * 0.1;
  
  return Math.round((confidenceScore + recencyScore + usageScore) * 100) / 100;
}

// ─── Core Decay Functions ────────────────────────────────────────────────────

/**
 * Apply Ebbinghaus decay to a single knowledge record.
 * Returns the new confidence value.
 */
export async function decayKnowledgeConfidence(
  knowledgeId: string,
): Promise<number> {
  const knowledge = await getKnowledgeById(knowledgeId);
  if (!knowledge) {
    throw new Error(`Knowledge not found: ${knowledgeId}`);
  }

  if (knowledge.status !== 'active') return knowledge.confidence;

  const config = KIND_DECAY_CONFIGS[knowledge.knowledgeKind];
  const lastUse = knowledge.lastUsedAt ?? knowledge.lastConfirmedAt ?? knowledge.createdAt.getTime();
  const days = daysSince(lastUse);

  // Apply exponential decay
  const decayFactor = Math.pow(0.5, days / config.halfLifeDays);
  const newConfidence = Math.max(
    config.minConfidence,
    Math.round(knowledge.confidence * decayFactor * 100) / 100,
  );

  if (newConfidence < knowledge.confidence) {
    // Also update importance_score based on new confidence
    const newImportance = calculateImportanceScore(
      newConfidence,
      days,
      knowledge.usageCount,
      config,
    );

    await updateKnowledge(knowledgeId, {
      confidence: newConfidence,
      importanceScore: newImportance,
      lastImportanceRecalc: Date.now(),
    });

    logger.debug('Knowledge confidence decayed', {
      id: knowledgeId,
      kind: knowledge.knowledgeKind,
      from: knowledge.confidence,
      to: newConfidence,
      importanceFrom: knowledge.importanceScore,
      importanceTo: newImportance,
      daysSinceUse: Math.round(days),
    });
  }

  return newConfidence;
}

/**
 * Apply decay to all active knowledge of a given kind.
 * Returns the number of records decayed.
 */
export async function decayAllKnowledge(
  kind: KnowledgeKind,
  projectId?: string,
): Promise<{ decayed: number; deprecated: number }> {
  const config = KIND_DECAY_CONFIGS[kind];
  const knowledge = await listKnowledgeByKind(projectId ?? '', kind, {
    status: 'active',
    limit: 1000,
  });

  let decayed = 0;
  let deprecated = 0;

  for (const item of knowledge) {
    // Apply confidence decay
    const newConf = await decayKnowledgeConfidence(item.id);
    if (newConf < item.confidence) decayed++;

    // Auto-deprecate if below threshold and never used
    if (
      newConf <= config.minConfidence &&
      item.usageCount === 0 &&
      daysSince(item.createdAt) > 90
    ) {
      await updateKnowledge(item.id, { status: 'deprecated' });
      deprecated++;
    }
  }

  if (decayed > 0 || deprecated > 0) {
    logger.info('Knowledge decay batch complete', {
      kind,
      decayed,
      deprecated,
      total: knowledge.length,
    });
  }

  return { decayed, deprecated };
}

/**
 * Boost confidence on success (belief confirmation / strategy success).
 * Returns the new confidence value.
 */
export async function boostConfidence(
  knowledgeId: string,
  amount?: number,
): Promise<number> {
  const knowledge = await getKnowledgeById(knowledgeId);
  if (!knowledge) {
    throw new Error(`Knowledge not found: ${knowledgeId}`);
  }

  const config = KIND_DECAY_CONFIGS[knowledge.knowledgeKind];
  const boostAmount = amount ?? config.successBoost;
  const newConfidence = Math.min(1.0, knowledge.confidence + boostAmount);

  if (newConfidence > knowledge.confidence) {
    await updateKnowledge(knowledgeId, { confidence: newConfidence });

    logger.debug('Knowledge confidence boosted', {
      id: knowledgeId,
      kind: knowledge.knowledgeKind,
      from: knowledge.confidence,
      to: newConfidence,
      amount: boostAmount,
    });
  }

  return newConfidence;
}

/**
 * Confirm a belief — resets decay timer and boosts confidence.
 */
export async function confirmBelief(beliefId: string): Promise<number> {
  const knowledge = await getKnowledgeById(beliefId);
  if (!knowledge || knowledge.knowledgeKind !== 'belief') {
    throw new Error(`Belief not found: ${beliefId}`);
  }

  const newConfidence = Math.min(1.0, knowledge.confidence + 0.08);

  await updateKnowledge(beliefId, {
    confidence: newConfidence,
    lastConfirmedAt: Date.now(),
    sourceCount: knowledge.sourceCount + 1,
  });

  logger.debug('Belief confirmed', {
    id: beliefId,
    from: knowledge.confidence,
    to: newConfidence,
    sourceCount: knowledge.sourceCount + 1,
  });

  return newConfidence;
}

/**
 * Record strategy usage — updates usage stats and confidence.
 */
export async function recordStrategyUsage(
  strategyId: string,
  success: boolean,
): Promise<number> {
  const knowledge = await getKnowledgeById(strategyId);
  if (!knowledge || knowledge.knowledgeKind !== 'strategy') {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  const newUsage = knowledge.usageCount + 1;
  const newSuccess = knowledge.successCount + (success ? 1 : 0);
  const newFailure = knowledge.failureCount + (success ? 0 : 1);

  // Calculate new confidence based on success rate
  const successRate = newUsage > 0 ? newSuccess / newUsage : 0.5;
  const baseConfidence = knowledge.confidence;
  const newConfidence = Math.min(1.0, Math.max(0.05,
    baseConfidence + (success ? 0.03 : -0.02),
  ));

  await updateKnowledge(strategyId, {
    usageCount: newUsage,
    successCount: newSuccess,
    failureCount: newFailure,
    lastUsedAt: Date.now(),
    lastSuccessAt: success ? Date.now() : (knowledge.lastSuccessAt ?? undefined),
    lastFailureAt: success ? (knowledge.lastFailureAt ?? undefined) : Date.now(),
    confidence: newConfidence,
  });

  logger.debug('Strategy usage recorded', {
    id: strategyId,
    success,
    usageCount: newUsage,
    successRate: Math.round(successRate * 100) + '%',
  });

  return newConfidence;
}

/**
 * Run decay for all knowledge kinds in a project.
 * This is called during the sleep cycle / consolidation.
 */
export async function runDecayCycle(projectId?: string): Promise<{
  memories: { decayed: number; deprecated: number };
  beliefs: { decayed: number; deprecated: number };
  strategies: { decayed: number; deprecated: number };
}> {
  const [memories, beliefs, strategies] = await Promise.all([
    decayAllKnowledge('memory', projectId),
    decayAllKnowledge('belief', projectId),
    decayAllKnowledge('strategy', projectId),
  ]);

  logger.info('Decay cycle complete', { memories, beliefs, strategies });

  return { memories, beliefs, strategies };
}
