/**
 * Strategy Operations
 *
 * Lookup strategies by keywords via the storage layer.
 */

import { logger } from '../logger.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { and, eq, or } from 'drizzle-orm';
import type { StrategyRecord } from './types.js';

/**
 * Find strategies matching keywords in the strategies table.
 */
export async function getStrategyByKeywords(
  keywords: string[],
  projectId?: string
): Promise<StrategyRecord[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const keywordConditions = keywords.map(kw =>
      or(
        eq(schema.strategies.title, kw),
        eq(schema.strategies.description, kw)
      )
    );

    const whereClause = projectId
      ? and(or(...keywordConditions), eq(schema.strategies.projectId, projectId))
      : or(...keywordConditions);

    const rows = await (db as any)
      .select()
      .from(schema.strategies)
      .where(whereClause)
      .limit(10);

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      projectId: r.projectId as string | null,
      strategyType: r.strategyType as string,
      title: r.title as string,
      description: r.description as string,
      context: r.context as string | null,
      steps: r.steps as string | null,
      successCriteria: r.successCriteria as string | null,
      failureIndicators: r.failureIndicators as string | null,
      confidence: r.confidence as number | null,
      usageCount: r.usageCount as number | null,
      successCount: r.successCount as number | null,
      failureCount: r.failureCount as number | null,
      lastUsedAt: r.lastUsedAt as Date | null,
      lastSuccessAt: r.lastSuccessAt as Date | null,
      lastFailureAt: r.lastFailureAt as Date | null,
      status: r.status as string | null,
      supersededBy: r.supersededBy as string | null,
      tags: r.tags as string | null,
      metadata: r.metadata as Record<string, unknown> | null,
      visibilityScope: r.visibilityScope as string | null,
      createdAt: r.createdAt as Date,
      updatedAt: r.updatedAt as Date,
    }));
  } catch (err: unknown) {
    logger.debug('[StrategyOps] Lookup failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
