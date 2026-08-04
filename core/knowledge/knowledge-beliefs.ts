/**
 * Knowledge Belief Adapters — bridge the old beliefs/ API to the unified knowledge table.
 *
 * Single responsibility: all belief-specific operations. Consumers (agent-hooks,
 * explain, trust-state) import these instead of the old beliefs/store.js module.
 */

import { getDbClient } from '../lib/db-client.js';
import { toKnowledge } from './helpers.js';
import {
  ensureKnowledgeTables,
  createKnowledge,
  getKnowledgeById,
  updateKnowledge,
  searchKnowledge,
  listKnowledgeByKind,
} from './knowledge-crud.js';
import { createKnowledgeEdge } from './knowledge-edges.js';
import type {
  Knowledge,
  ExtractedBelief,
  StoredBelief,
  BeliefKnowledgeType,
} from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function knowledgeToStoredBelief(k: Knowledge): StoredBelief {
  return {
    id: k.id,
    projectId: k.projectId ?? '',
    type: k.knowledgeType as BeliefKnowledgeType,
    statement: k.content,
    normalizedKey: k.normalizedKey ?? '',
    confidence: k.confidence,
    status: k.status,
    reason: k.reason ?? undefined,
    context: undefined,
    evidenceSummary: k.evidenceSummary ?? undefined,
    sourceMemoryIds: [],
    lastConfirmedAt: k.lastConfirmedAt ? new Date(k.lastConfirmedAt) : null,
    sourceCount: k.sourceCount,
    beliefDecayRate: k.importanceDecayRate,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

// ─── Belief CRUD ─────────────────────────────────────────────────────────────

/**
 * Upsert beliefs extracted from a memory into the knowledge table.
 * Creates knowledge records of kind='belief' and links them to the source
 * memory via knowledge_edges.
 */
export async function upsertBeliefsForMemory(input: {
  projectId?: string;
  memoryId: string;
  beliefs: ExtractedBelief[];
}): Promise<StoredBelief[]> {
  const stored: StoredBelief[] = [];
  for (const belief of input.beliefs) {
    const normalizedKey = belief.statement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    // Check for existing belief with same normalized key in the project
    const existing = input.projectId
      ? await searchKnowledge({
          contentQuery: normalizedKey,
          projectId: input.projectId,
          kinds: ['belief'],
          limit: 1,
        })
      : [];

    let knowledge: Knowledge;
    if (existing.length > 0 && existing[0].normalizedKey === normalizedKey) {
      // Update existing
      const nextStatus = belief.type === 'failure_cause' ? 'disputed'
        : existing[0].knowledgeType !== belief.type && existing[0].content !== belief.statement ? 'superseded'
        : existing[0].status;
      await updateKnowledge(existing[0].id, {
        confidence: Math.max(existing[0].confidence, belief.confidence),
        status: nextStatus,
        reason: belief.reason ?? undefined,
        evidenceSummary: belief.evidenceSummary ?? undefined,
        sourceCount: (existing[0].sourceCount ?? 0) + 1,
      });
      knowledge = (await getKnowledgeById(existing[0].id))!;
    } else {
      // Create new
      knowledge = await createKnowledge({
        projectId: input.projectId,
        knowledgeKind: 'belief',
        knowledgeType: belief.type,
        content: belief.statement,
        normalizedKey,
        confidence: belief.confidence,
        status: belief.status,
        reason: belief.reason,
        evidenceSummary: belief.evidenceSummary,
        tags: ['auto-extracted'],
      });
    }

    // Link belief to source memory via knowledge_edges
    try {
      await createKnowledgeEdge({
        fromId: knowledge.id,
        fromKind: 'knowledge',
        toId: input.memoryId,
        toKind: 'knowledge',
        edgeType: 'sourced_from',
      });
    } catch { /* edge may already exist */ }

    stored.push(knowledgeToStoredBelief(knowledge));
  }

  return stored;
}

/**
 * Get all beliefs linked to a specific memory via knowledge_edges.
 */
export async function getBeliefsForMemory(memoryId: string): Promise<StoredBelief[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  // Find knowledge edges where this memory is the target
  const edges = sqlite.prepare(`
    SELECT from_id FROM knowledge_edges
    WHERE to_id = ? AND to_kind = 'knowledge' AND from_kind = 'knowledge' AND edge_type = 'sourced_from'
  `).all(memoryId) as { from_id: string }[];

  if (edges.length === 0) return [];

  const beliefIds = edges.map(e => e.from_id);
  const placeholders = beliefIds.map(() => '?').join(',');
  const rows = sqlite.prepare(`
    SELECT * FROM knowledge
    WHERE id IN (${placeholders}) AND knowledge_kind = 'belief'
    ORDER BY updated_at DESC
  `).all(...beliefIds) as any[];

  return rows.map(row => knowledgeToStoredBelief(toKnowledge(row)));
}

// ─── Belief Queries (Session Boot) ───────────────────────────────────────────

/**
 * Get active constraint beliefs for session boot.
 * Returns beliefs that should shape next actions.
 */
export async function getActiveConstraints(projectId: string): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['constraint'],
    limit: 20,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Get active decision beliefs for session boot.
 * Returns decisions that should guide next actions.
 */
export async function getActiveDecisions(projectId: string): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['decision'],
    limit: 20,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Get recent failure beliefs for session boot.
 * Returns failure_cause beliefs to avoid repeating mistakes.
 */
export async function getRecentFailures(projectId: string, count: number = 10): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['failure_cause'],
    limit: count,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Search beliefs by content.
 */
export async function searchBeliefs(
  projectId: string,
  query: string,
  options?: { type?: string; minConfidence?: number; limit?: number },
): Promise<StoredBelief[]> {
  const rows = await searchKnowledge({
    contentQuery: query,
    projectId,
    kinds: ['belief'],
    limit: options?.limit ?? 50,
  });
  let filtered = rows;
  if (options?.type) {
    filtered = filtered.filter(r => r.knowledgeType === options.type);
  }
  if (options?.minConfidence !== undefined) {
    filtered = filtered.filter(r => r.confidence >= options.minConfidence!);
  }
  return filtered.map(knowledgeToStoredBelief);
}

/**
 * Get all beliefs for a project.
 */
export async function getAllBeliefs(
  projectId: string,
  options?: { type?: string; status?: string; minConfidence?: number; limit?: number },
): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    limit: options?.limit ?? 100,
  });
  let filtered = rows;
  if (options?.type) {
    filtered = filtered.filter(r => r.knowledgeType === options.type);
  }
  if (options?.status) {
    filtered = filtered.filter(r => r.status === options.status);
  }
  if (options?.minConfidence !== undefined) {
    filtered = filtered.filter(r => r.confidence >= options.minConfidence!);
  }
  return filtered.map(knowledgeToStoredBelief);
}

/**
 * Get beliefs relevant to a task/query for session boot.
 */
export async function getRelevantBeliefs(
  projectId: string,
  taskQuery: string,
  limit: number = 10,
): Promise<StoredBelief[]> {
  const rows = await searchKnowledge({
    contentQuery: taskQuery,
    projectId,
    kinds: ['belief'],
    status: 'active',
    limit,
  });
  return rows.map(knowledgeToStoredBelief);
}
