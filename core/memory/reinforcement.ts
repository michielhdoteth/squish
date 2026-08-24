/**
 * Reinforcement loop (Batch 6b).
 *
 * One small entry point that lets agents push confirmation signals back into
 * the system after retrieval: squish_feedback { targetType, id, signal }.
 *
 * Signals and their effects (modest, documented):
 *
 *   belief    confirm     -> confirmBelief(): confidence boost, decay timer reset,
 *                            sourceCount++
 *   belief    used        -> small confidence boost (usage is weak evidence)
 *   belief    contradict  -> status 'disputed' + confidence penalty
 *
 *   strategy  confirm|used-> recordStrategyUsage(success=true): usage/success
 *                            counters, last_used_at, confidence nudge
 *   strategy  contradict  -> recordStrategyUsage(success=false)
 *
 *   memory    confirm     -> retrieval priority bump + usage_count++ +
 *                            last_used_at refresh
 *   memory    used        -> access/usage counters + recency anchors + tiny
 *                            priority bump
 *   memory    contradict  -> confidence_level = 'outdated' (the soft conflict
 *                            marker recall-confidence already multiplies by
 *                            0.70) + retrieval priority penalty
 *
 * Reinforcement updates ONLY confidence/priority columns that retrieval and
 * recallConfidence read - never importance_score, which is reinforced
 * separately by the importance engine.
 */

import { logger } from '../logger.js';

export type FeedbackTargetType = 'memory' | 'belief' | 'strategy';
export type FeedbackSignal = 'confirm' | 'contradict' | 'used';

export interface FeedbackInput {
  targetType: FeedbackTargetType;
  id: string;
  signal: FeedbackSignal;
}

export interface FeedbackResult {
  ok: boolean;
  applied: boolean;
  targetType: FeedbackTargetType;
  id: string;
  signal: FeedbackSignal;
  /** New confidence value when the target tracks one (belief/strategy). */
  confidence?: number;
  detail?: string;
}

const MEMORY_CONTRADICT_PRIORITY_PENALTY = 10;
const MEMORY_USED_PRIORITY_BONUS = 1;
const MEMORY_CONFIRM_PRIORITY_BONUS = 5;

export async function applyFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const base: FeedbackResult = {
    ok: false,
    applied: false,
    targetType: input.targetType,
    id: input.id,
    signal: input.signal,
  };

  if (!input.id) return { ...base, detail: 'id required' };

  try {
    switch (input.targetType) {
      case 'belief':
        return { ...base, ...(await applyBeliefFeedback(input)) };
      case 'strategy':
        return { ...base, ...(await applyStrategyFeedback(input)) };
      case 'memory':
        return { ...base, ...(await applyMemoryFeedback(input)) };
      default:
        return { ...base, detail: `unknown targetType: ${input.targetType}` };
    }
  } catch (error: any) {
    logger.warn(`[Reinforcement] Feedback failed (${input.targetType}/${input.signal}): ${error?.message ?? error}`);
    return { ...base, detail: error?.message ?? String(error) };
  }
}

// ─── Beliefs ─────────────────────────────────────────────────────────────────

async function applyBeliefFeedback(input: FeedbackInput): Promise<Partial<FeedbackResult>> {
  const { confirmBelief, boostConfidence } = await import('../knowledge/decay.js');
  const { getKnowledgeById, updateKnowledge } = await import('../knowledge/knowledge-crud.js');

  if (input.signal === 'confirm') {
    const confidence = await confirmBelief(input.id);
    return { ok: true, applied: true, confidence, detail: 'belief confirmed: confidence boosted, decay timer reset' };
  }

  if (input.signal === 'used') {
    const confidence = await boostConfidence(input.id, 0.02);
    return { ok: true, applied: true, confidence, detail: 'belief usage recorded: small confidence boost' };
  }

  // contradict -> disputed + penalty
  const knowledge = await getKnowledgeById(input.id);
  if (!knowledge || knowledge.knowledgeKind !== 'belief') {
    throw new Error(`Belief not found: ${input.id}`);
  }
  await updateKnowledge(input.id, {
    status: 'disputed',
    confidence: Math.max(0.05, Math.round((knowledge.confidence - 0.15) * 100) / 100),
  });
  return { ok: true, applied: true, detail: 'belief marked disputed with confidence penalty' };
}

// ─── Strategies ──────────────────────────────────────────────────────────────

async function applyStrategyFeedback(input: FeedbackInput): Promise<Partial<FeedbackResult>> {
  const { recordStrategyUsage } = await import('../knowledge/decay.js');
  const success = input.signal !== 'contradict';
  const confidence = await recordStrategyUsage(input.id, success);
  return {
    ok: true,
    applied: true,
    confidence,
    detail: `strategy usage recorded (success=${success})`,
  };
}

// ─── Memories ────────────────────────────────────────────────────────────────

async function applyMemoryFeedback(input: FeedbackInput): Promise<Partial<FeedbackResult>> {
  const dbModule = await import('../../db/index.js');
  const schemaModule = await import('../../db/schema.js');
  const { eq, sql } = await import('drizzle-orm');

  const db = await dbModule.getDb();
  if (!db) throw new Error('database unavailable');
  const schema = await schemaModule.getSchema();
  if (!(schema as any)?.memories) throw new Error('memories table unavailable');

  const now = new Date();

  if (input.signal === 'confirm') {
    // Priority bump (retrieval_priority feeds ranking-side heuristics) plus a
    // usage/recency anchor so decay treats it as recently reinforced.
    const { updateRetrievalPriority } = await import('./feedback-tracker.js');
    await updateRetrievalPriority(input.id, MEMORY_CONFIRM_PRIORITY_BONUS);
    await (db as any).update(schema.memories).set({
      usageCount: sql`${schema.memories.usageCount} + 1`,
      lastUsedAt: now,
      updatedAt: now,
    }).where(eq(schema.memories.id, input.id));
    return { ok: true, applied: true, detail: `memory confirmed: priority +${MEMORY_CONFIRM_PRIORITY_BONUS}, usage anchored` };
  }

  if (input.signal === 'used') {
    const { updateRetrievalPriority } = await import('./feedback-tracker.js');
    await updateRetrievalPriority(input.id, MEMORY_USED_PRIORITY_BONUS);
    await (db as any).update(schema.memories).set({
      accessCount: sql`${schema.memories.accessCount} + 1`,
      lastAccessedAt: now,
      lastUsedAt: now,
      updatedAt: now,
    }).where(eq(schema.memories.id, input.id));
    return { ok: true, applied: true, detail: 'memory usage recorded: counters + recency refreshed' };
  }

  // contradict -> soft outdated marker + priority penalty. recall-confidence
  // multiplies 'outdated' memories by 0.70 and hard-caps conflicted trust.
  const { updateRetrievalPriority } = await import('./feedback-tracker.js');
  await updateRetrievalPriority(input.id, -MEMORY_CONTRADICT_PRIORITY_PENALTY);
  await (db as any).update(schema.memories).set({
    confidenceLevel: 'outdated',
    updatedAt: now,
  }).where(eq(schema.memories.id, input.id));
  return { ok: true, applied: true, detail: "memory marked 'outdated' with priority penalty" };
}
