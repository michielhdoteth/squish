/**
 * Shared helpers for knowledge modules.
 *
 * Serialization, deserialization, and DB-row → typed-object mappers.
 * These are consumed by knowledge-crud, knowledge-edges, and knowledge-beliefs.
 */

import type {
  Knowledge,
  KnowledgeKind,
  KnowledgeType,
  KnowledgeStatus,
  KnowledgeEdge,
  EdgeNodeKind,
} from './types.js';

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializeJson(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  return JSON.stringify(obj);
}

export function deserializeJson<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try { return JSON.parse(str) as T; } catch { return null; }
}

// ─── Row Mappers ─────────────────────────────────────────────────────────────

export function toKnowledge(row: any): Knowledge {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    agentId: row.agent_id ?? null,
    sessionId: row.session_id ?? null,
    knowledgeKind: row.knowledge_kind as KnowledgeKind,
    knowledgeType: row.knowledge_type as KnowledgeType,
    content: row.content,
    summary: row.summary ?? null,
    embeddingJson: row.embedding_json ?? null,
    embedding: row.embedding ?? null,
    confidence: row.confidence ?? 0.5,
    confidenceLevel: row.confidence_level ?? 'certain',
    importanceScore: row.importance_score ?? 0.5,
    importanceDecayRate: row.importance_decay_rate ?? 30,
    lastImportanceRecalc: row.last_importance_recalc ?? null,
    normalizedKey: row.normalized_key ?? null,
    reason: row.reason ?? null,
    evidenceSummary: row.evidence_summary ?? null,
    lastConfirmedAt: row.last_confirmed_at ?? null,
    sourceCount: row.source_count ?? 1,
    title: row.title ?? null,
    description: row.description ?? null,
    steps: row.steps ?? null,
    successCriteria: row.success_criteria ?? null,
    failureIndicators: row.failure_indicators ?? null,
    usageCount: row.usage_count ?? 0,
    successCount: row.success_count ?? 0,
    failureCount: row.failure_count ?? 0,
    lastUsedAt: row.last_used_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    status: row.status as KnowledgeStatus ?? 'active',
    supersededBy: row.superseded_by ?? null,
    contradictsId: row.contradicts_id ?? null,
    informedById: row.informed_by_id ?? null,
    tags: row.tags ?? null,
    metadata: deserializeJson(row.metadata),
    placeId: row.place_id ?? null,
    primaryPlace: row.primary_place ?? null,
    sector: row.sector ?? 'general',
    tier: row.tier ?? 'episodic',
    isActive: row.is_active ?? 1,
    createdAt: new Date((row.created_at ?? 0) * 1000),
    updatedAt: new Date((row.updated_at ?? 0) * 1000),
  };
}

export function toKnowledgeEdge(row: any): KnowledgeEdge {
  return {
    id: row.id,
    fromId: row.from_id,
    fromKind: row.from_kind as EdgeNodeKind,
    toId: row.to_id,
    toKind: row.to_kind as EdgeNodeKind,
    edgeType: row.edge_type,
    weight: row.weight ?? 1.0,
    metadata: deserializeJson(row.metadata),
    createdAt: new Date((row.created_at ?? 0) * 1000),
  };
}
