/**
 * LLM Consolidator
 *
 * Uses LLM to find creative cross-connections across memories that the
 * algorithmic DBSCAN approach would miss. Stores insights as knowledge
 * records and creates edges between related memories.
 *
 * Design principles:
 * - LLM is ALWAYS optional - returns empty results when unavailable
 * - No placeholder content - only real LLM-generated insights
 * - Uses existing knowledge system (createKnowledge + createKnowledgeEdge)
 * - Batched to avoid token limits (max 20 memories per batch)
 */

import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import { createKnowledge, createKnowledgeEdge } from '../knowledge/store.js';
import type { KnowledgeKind, KnowledgeEdgeType } from '../knowledge/types.js';

// Lazy LLM import
let callLLM: ((prompt: string) => Promise<string | null>) | null = null;

async function loadLLMClient() {
  if (!callLLM) {
    try {
      const mod = await import('../llm/client.js');
      callLLM = mod.callLLM;
    } catch {
      // LLM not available
    }
  }
  return callLLM;
}

export interface ConsolidationResult {
  insightsCreated: number;
  edgesCreated: number;
  memoriesProcessed: number;
  errors: string[];
}

interface MemorySummary {
  id: string;
  content: string;
  type: string;
  tags: string[];
  createdAt: string;
}

/**
 * Run LLM-driven consolidation on recent memories.
 *
 * 1. Fetch unconsolidated memories
 * 2. Send batches to LLM for cross-connection analysis
 * 3. Store insights as knowledge records
 * 4. Create edges between connected memories
 */
export async function runLLMConsolidation(
  projectId?: string,
  options?: { maxMemories?: number; batchSize?: number },
): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    insightsCreated: 0,
    edgesCreated: 0,
    memoriesProcessed: 0,
    errors: [],
  };

  const llm = await loadLLMClient();
  if (!llm) {
    logger.debug('[LLM Consolidator] LLM not available, skipping');
    return result;
  }

  const maxMemories = options?.maxMemories ?? 50;
  const batchSize = options?.batchSize ?? 20;

  try {
    // 1. Fetch recent unconsolidated memories
    const memories = await fetchRecentMemories(projectId, maxMemories);
    if (memories.length === 0) {
      logger.debug('[LLM Consolidator] No memories to consolidate');
      return result;
    }

    logger.info(`[LLM Consolidator] Processing ${memories.length} memories in batches of ${batchSize}`);

    // 2. Process in batches
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      try {
        const batchResult = await processBatch(batch, llm);
        result.insightsCreated += batchResult.insightsCreated;
        result.edgesCreated += batchResult.edgesCreated;
        result.memoriesProcessed += batch.length;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Batch ${Math.floor(i / batchSize)}: ${msg}`);
        logger.debug(`[LLM Consolidator] Batch failed: ${msg}`);
      }
    }

    logger.info(
      `[LLM Consolidator] Complete: ${result.insightsCreated} insights, ` +
      `${result.edgesCreated} edges, ${result.memoriesProcessed} memories processed`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fatal: ${msg}`);
    logger.debug(`[LLM Consolidator] Fatal error: ${msg}`);
  }

  return result;
}

/**
 * Process a batch of memories with LLM to find connections.
 */
async function processBatch(
  memories: MemorySummary[],
  llm: (prompt: string) => Promise<string | null>,
): Promise<{ insightsCreated: number; edgesCreated: number }> {
  let insightsCreated = 0;
  let edgesCreated = 0;

  // Build context for LLM
  const memoryList = memories.map((m, i) =>
    `[${i}] (${m.type}, ${m.tags.join(', ')}) ${m.content.slice(0, 300)}`
  ).join('\n');

  const prompt = `Analyze these memories and find cross-connections, patterns, and insights.

Memories:
${memoryList}

Respond with ONLY valid JSON (no markdown fences):
{
  "connections": [
    { "from": <index>, "to": <index>, "reason": "<why they're connected>", "type": "related_to" | "supports" | "contradicts" | "extends" | "causes" }
  ],
  "insights": [
    { "content": "<pattern or insight you noticed>", "confidence": <0.0-1.0>, "relatedIndices": [<indices this insight relates to>] }
  ]
}

Rules:
- Only include connections you're genuinely confident about
- Insights should be non-obvious observations, not restatements
- Keep connections and insights minimal (max 5 each)
- Focus on semantic connections, not just shared keywords`;

  const response = await llm(prompt);
  if (!response) return { insightsCreated, edgesCreated };

  // Parse LLM response
  let parsed: { connections?: Array<{ from: number; to: number; reason: string; type: string }>; insights?: Array<{ content: string; confidence: number; relatedIndices: number[] }> };
  try {
    // Try to extract JSON from response (may have markdown fences)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { insightsCreated, edgesCreated };
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    logger.debug('[LLM Consolidator] Failed to parse LLM response');
    return { insightsCreated, edgesCreated };
  }

  // Create edges from connections
  if (parsed.connections) {
    for (const conn of parsed.connections) {
      const from = memories[conn.from];
      const to = memories[conn.to];
      if (!from || !to) continue;

      try {
        await createKnowledgeEdge({
          fromId: from.id,
          fromKind: 'knowledge',
          toId: to.id,
          toKind: 'knowledge',
          edgeType: normalizeEdgeType(conn.type),
          weight: 0.8,
          metadata: {
            reason: conn.reason,
            source: 'llm-consolidator',
          },
        });
        edgesCreated++;
      } catch {
        // Edge may already exist - that's fine
      }
    }
  }

  // Create insight knowledge records
  if (parsed.insights) {
    for (const insight of parsed.insights) {
      if (!insight.content || insight.content.length < 10) continue;

      try {
        await createKnowledge({
          knowledgeKind: 'belief' as KnowledgeKind,
          knowledgeType: 'state_change',
          content: insight.content,
          confidence: insight.confidence ?? 0.7,
          tags: ['auto-consolidated', 'llm-insight'],
          metadata: {
            source: 'llm-consolidator',
            relatedMemoryIds: insight.relatedIndices
              .map(i => memories[i]?.id)
              .filter(Boolean),
          },
        });
        insightsCreated++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`[LLM Consolidator] Failed to create insight: ${msg}`);
      }
    }
  }

  return { insightsCreated, edgesCreated };
}

/**
 * Fetch recent memories for consolidation.
 * Prioritizes unconsolidated memories but includes recent ones too.
 */
async function fetchRecentMemories(projectId: string | undefined, limit: number): Promise<MemorySummary[]> {
  try {
    const { db, schema } = await getDbClient();
    const { eq, and, desc } = await import('drizzle-orm');

    const conditions = [
      eq(schema.memories.status, 'active'),
    ];
    if (projectId) {
      conditions.push(eq(schema.memories.projectId, projectId));
    }

    const rows = await db
      .select({
        id: schema.memories.id,
        content: schema.memories.content,
        type: schema.memories.type,
        tags: schema.memories.tags,
        createdAt: schema.memories.createdAt,
      })
      .from(schema.memories)
      .where(and(...conditions))
      .orderBy(desc(schema.memories.createdAt))
      .limit(limit);

    return rows.map((row: { id: string; content: string | null; type: string | null; tags: unknown; createdAt: unknown }) => ({
      id: row.id,
      content: row.content ?? '',
      type: row.type ?? 'fact',
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
      createdAt: row.createdAt ? new Date(row.createdAt as string | number).toISOString() : new Date().toISOString(),
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug(`[LLM Consolidator] Failed to fetch memories: ${msg}`);
    return [];
  }
}

/**
 * Normalize LLM-generated edge types to valid KnowledgeEdgeType values.
 */
function normalizeEdgeType(type: string): KnowledgeEdgeType {
  const valid: Record<string, KnowledgeEdgeType> = {
    related_to: 'related_to',
    supports: 'supports',
    contradicts: 'contradicts',
    extends: 'extends',
    causes: 'causes',
    informs: 'informed_by',
    depends_on: 'depends_on',
  };
  return valid[type.toLowerCase()] ?? 'related_to';
}
