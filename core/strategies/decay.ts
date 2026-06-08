import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import { updateStrategy, getStrategy } from './store.js';

/**
 * Strategy Decay Engine
 *
 * Manages confidence decay for strategies over time.
 * Formula: newConfidence = confidence * (0.5 ^ (daysSinceLastUse / halfLife))
 * - Default 30 days half-life
 * - Unused strategies decay faster
 * - High-usage strategies are boosted
 */

const DEFAULT_HALF_LIFE = 30; // days
const MIN_CONFIDENCE = 0.05;
const DEFAULT_BOOST = 0.05;

/**
 * Calculate days since a given timestamp.
 */
function daysSince(timestamp: number | Date | null): number {
  if (!timestamp) return 365; // If never used, treat as very old
  const ts = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  return Math.max(0, (Date.now() - ts) / (24 * 60 * 60 * 1000));
}

/**
 * Apply Ebbinghaus decay to a strategy's confidence based on usage recency.
 * Returns the new confidence value.
 */
export async function decayStrategyConfidence(strategyId: string): Promise<number> {
  const strategy = await getStrategy(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  if (strategy.status !== 'active') return strategy.confidence;

  const days = daysSince(strategy.lastUsedAt);
  const halfLife = DEFAULT_HALF_LIFE;

  // Apply exponential decay
  const decayFactor = Math.pow(0.5, days / halfLife);
  const newConfidence = Math.max(MIN_CONFIDENCE, Math.round(strategy.confidence * decayFactor * 100) / 100);

  if (newConfidence < strategy.confidence) {
    await updateStrategy(strategyId, { confidence: newConfidence });
    logger.debug('Strategy confidence decayed', {
      id: strategyId,
      from: strategy.confidence,
      to: newConfidence,
      daysSinceUse: Math.round(days),
    });
  }

  return newConfidence;
}

/**
 * Auto-deprecate strategies that have never been used and are older than N days.
 * Returns IDs of deprecated strategies.
 */
export async function autoDeprecateUnusedStrategies(
  projectId?: string,
  unusedDays: number = 90,
): Promise<string[]> {
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';
  const deprecatedIds: string[] = [];

  if (!sqlite && !isPg) return deprecatedIds;

  const cutoffDate = new Date(Date.now() - unusedDays * 24 * 60 * 60 * 1000);

  let strategies: any[] = [];

  if (isPg) {
    const conditions = ["status = 'active'", 'usage_count = 0', 'created_at < $1'];
    const params: any[] = [cutoffDate];
    if (projectId) {
      params.push(projectId);
      conditions.push(`project_id = $${params.length}`);
    }
    const result = await (raw as any).query(
      `SELECT id FROM strategies WHERE ${conditions.join(' AND ')}`,
      params,
    );
    strategies = result.rows;
  } else if (sqlite) {
    const conditions = ["status = 'active'", 'usage_count = 0'];
    const params: any[] = [];
    if (projectId) {
      params.push(projectId);
      conditions.push('project_id = ?');
    }
    // SQLite stores timestamps as unix seconds
    const cutoffSeconds = Math.floor(cutoffDate.getTime() / 1000);
    params.push(cutoffSeconds);
    conditions.push('created_at < ?');
    strategies = sqlite.prepare(
      `SELECT id FROM strategies WHERE ${conditions.join(' AND ')}`
    ).all(...params);
  }

  for (const strategy of strategies) {
    try {
      await updateStrategy(strategy.id, { status: 'deprecated' });
      deprecatedIds.push(strategy.id);
    } catch (err) {
      logger.error('Failed to deprecate strategy', { id: strategy.id, error: err });
    }
  }

  if (deprecatedIds.length > 0) {
    logger.info('Auto-deprecated unused strategies', { count: deprecatedIds.length });
  }

  return deprecatedIds;
}

/**
 * Boost a strategy's confidence on success.
 * Clamps confidence to [0, 1].
 * Returns the new confidence value.
 */
export async function boostConfidence(
  strategyId: string,
  amount: number = DEFAULT_BOOST,
): Promise<number> {
  const strategy = await getStrategy(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  const newConfidence = Math.min(1.0, strategy.confidence + amount);

  if (newConfidence > strategy.confidence) {
    await updateStrategy(strategyId, { confidence: newConfidence });
    logger.debug('Strategy confidence boosted', {
      id: strategyId,
      from: strategy.confidence,
      to: newConfidence,
      amount,
    });
  }

  return newConfidence;
}
